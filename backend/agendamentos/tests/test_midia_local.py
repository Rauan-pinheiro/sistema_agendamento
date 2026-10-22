"""Provedor de mídia local (desenvolvimento e simulação): fluxo completo sem Cloudinary."""
import os
import shutil
import subprocess
import sys
import tempfile
import time
from io import StringIO
from urllib.parse import parse_qsl, urlsplit

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.http import Http404
from rest_framework.test import APITestCase

from agendamentos import midia, midia_local
from agendamentos.models import Agendamento, AnexoAgendamento

from .factories import amanha_as, criar_empresa, criar_servico

JPG = b'\xff\xd8\xff\xe0' + b'0' * 200
PNG = b'\x89PNG\r\n\x1a\n' + b'0' * 200


class MidiaLocalTests(APITestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, ignore_errors=True)
        cfg = override_settings(MIDIA_PROVEDOR='local', MIDIA_LOCAL_DIR=self.dir,
                                MIDIA_LOCAL_URL_BASE='http://api.local')
        cfg.enable()
        self.addCleanup(cfg.disable)
        midia.provedor.cache_clear()
        self.addCleanup(midia.provedor.cache_clear)

        self.emp = criar_empresa('estudio')
        self.ag = Agendamento.objects.create(
            empresa=self.emp, servico=criar_servico(self.emp), nome_cliente='C',
            whatsapp_cliente='85999990000', data_hora=amanha_as(10), duracao_total_min=30,
        )
        self.base = f'/api/v1/agendamentos/{self.ag.id}/anexos/'
        self.client.force_authenticate(self.emp.owner)
        self.rf = RequestFactory()

    def _assinar(self):
        r = self.client.post(f'{self.base}assinatura/', {'nome': 'foto.jpg', 'mime': 'image/jpeg', 'tamanho': 204},
                             format='json')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    def _subir(self, assinatura, conteudo=JPG, **troca):
        campos = {**assinatura['campos'], **troca}
        req = self.rf.post('/up', {**campos, 'file': SimpleUploadedFile('foto.jpg', conteudo)})
        return midia_local.receber_upload(req)

    def _servir(self, url):
        partes = urlsplit(url)
        entrega, public_id = partes.path.split('/api/v1/midia-local/arquivo/')[1].split('/', 1)
        req = self.rf.get(partes.path, dict(parse_qsl(partes.query)))
        return midia_local.servir_arquivo(req, entrega, public_id)

    def test_fluxo_completo_upload_leitura_e_remocao(self):
        a = self._assinar()
        self.assertEqual(a['upload_url'], 'http://api.local/api/v1/midia-local/upload/')
        self.assertNotIn('SECRET', str(a))
        self.assertEqual(self._subir(a).status_code, 200)

        r = self.client.post(self.base, {'public_id': a['public_id'], 'tipo': 'imagem', 'nome': 'foto.jpg'},
                             format='json')
        self.assertEqual(r.status_code, 201, r.data)
        anexo = AnexoAgendamento.objects.get()
        self.assertEqual((anexo.formato, anexo.bytes), ('jpg', len(JPG)))

        url = self.client.get(self.base).data['anexos'][0]['url']
        self.assertIn('sig=', url)  # anexo privado: URL assinada
        resp = self._servir(url)
        self.assertEqual(b''.join(resp.streaming_content), JPG)
        self.assertEqual(resp['Content-Type'], 'image/jpeg')
        resp.close()
        with self.assertRaises(Http404):  # sem assinatura não abre
            self._servir(url.split('?')[0])

        with self.captureOnCommitCallbacks(execute=True):  # o arquivo é apagado depois do commit
            self.assertEqual(self.client.delete(f'{self.base}{anexo.id}/').status_code, 204)
        self.assertIsNone(midia_local._caminho(a['public_id'], midia.TIPO_ENTREGA))

    def test_upload_recusa_assinatura_adulterada_formato_errado_e_reenvio(self):
        a = self._assinar()
        self.assertEqual(self._subir(a, public_id=a['public_id'] + 'x').status_code, 401)
        self.assertEqual(self._subir(a, conteudo=b'GIF89a' + b'0' * 50).status_code, 400)
        self.assertEqual(self._subir(a, conteudo=PNG).status_code, 200)  # png é imagem permitida
        self.assertEqual(self._subir(a).status_code, 409)  # não sobrescreve

    def test_upload_recusa_assinatura_expirada(self):
        a = self._assinar()
        ts = int(time.time()) - midia_local.VALIDADE_UPLOAD_SEG - 10
        campos = {'timestamp': str(ts), 'signature': midia_local._assinar(a['public_id'], 'imagem',
                                                                          'authenticated', ts)}
        self.assertEqual(self._subir(a, **campos).status_code, 401)

    def test_url_privada_expirada_nao_abre(self):
        a = self._assinar()
        self._subir(a)
        exp = int(time.time()) - 1
        url = (f'/api/v1/midia-local/arquivo/authenticated/{a["public_id"]}?exp={exp}'
               f'&sig={midia_local._assinar("authenticated", a["public_id"], exp)}')
        with self.assertRaises(Http404):
            self._servir(url)

    def test_caminho_fora_da_pasta_e_recusado(self):
        self.assertIsNone(midia_local._caminho('../../etc/passwd', 'upload'))

    def test_listar_uso_e_alerta_de_creditos(self):
        a = self._assinar()
        self._subir(a)
        self.assertEqual([x.public_id for x in midia.listar_arquivos()], [a['public_id']])
        out = StringIO()
        call_command('verificar_uso_midia', stdout=out)
        self.assertIn('Abaixo do alerta de 15', out.getvalue())
        with override_settings(MIDIA_ALERTA_CREDITOS=0):
            with self.assertRaises(CommandError):
                call_command('verificar_uso_midia', stdout=StringIO())


class GuardaRenderTests(SimpleTestCase):
    def test_settings_recusa_provedor_local_no_render(self):
        env = {**os.environ, 'MIDIA_PROVEDOR': 'local', 'RENDER': 'true', 'DJANGO_DEBUG': 'true',
               'DJANGO_SETTINGS_MODULE': 'config.settings'}
        r = subprocess.run([sys.executable, '-c', 'import django; django.setup()'],
                           env=env, capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('MIDIA_PROVEDOR=local', r.stderr)
