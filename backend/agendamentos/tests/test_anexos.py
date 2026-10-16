"""Anexos de mídia nos agendamentos (Cloudinary simulado)."""
from unittest import mock

import cloudinary
from django.test import override_settings
from rest_framework.test import APITestCase

from agendamentos import midia
from agendamentos.models import Agendamento, AnexoAgendamento

from .factories import amanha_as, criar_empresa, criar_servico

MB = 1024 * 1024


def _meta(public_id, tipo='imagem', formato='jpg', tamanho=2 * MB):
    return midia.Metadados(public_id=public_id, tipo=tipo, formato=formato, bytes=tamanho,
                           largura=800, altura=600, duracao_seg=None)


@override_settings(MIDIA_MAX_ARQUIVOS_POR_AGENDAMENTO=3, MIDIA_MAX_BYTES_POR_AGENDAMENTO=20 * MB)
class AnexosTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._cfg_original = cloudinary.config().__dict__.copy()
        cloudinary.config(cloud_name='demo', api_key='123456', api_secret='segredo')

    @classmethod
    def tearDownClass(cls):
        cloudinary.config().__dict__.clear()
        cloudinary.config().__dict__.update(cls._cfg_original)
        super().tearDownClass()

    def setUp(self):
        self.emp = criar_empresa('estudio')
        servico = criar_servico(self.emp)
        self.ag = Agendamento.objects.create(
            empresa=self.emp, servico=servico, nome_cliente='C', whatsapp_cliente='85999990000',
            data_hora=amanha_as(10), duracao_total_min=30,
        )
        self.base = f'/api/v1/agendamentos/{self.ag.id}/anexos/'
        self.pasta = midia.pasta_do_agendamento(self.emp.id, self.ag.id)
        self.client.force_authenticate(self.emp.owner)

    # ── assinatura ──────────────────────────────────────────────────────────
    def assinar(self, nome='foto.jpg', mime='image/jpeg', tamanho=MB, **extra):
        return self.client.post(f'{self.base}assinatura/',
                                {'nome': nome, 'mime': mime, 'tamanho': tamanho, **extra}, format='json')

    def test_assinatura_restringe_pasta_e_formatos(self):
        r = self.assinar()
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data['public_id'].startswith(self.pasta + '/'))
        self.assertEqual(r.data['allowed_formats'], 'jpg,png,webp')
        self.assertEqual(r.data['type'], 'authenticated')
        self.assertEqual(r.data['resource_type'], 'image')
        self.assertNotIn('api_secret', r.data)
        # A assinatura confere com os parâmetros devolvidos
        params = {k: r.data[k] for k in ('timestamp', 'public_id', 'type', 'allowed_formats', 'overwrite')}
        self.assertEqual(r.data['signature'], cloudinary.utils.api_sign_request(params, 'segredo'))

    def test_assinatura_video(self):
        r = self.assinar('clip.mp4', 'video/mp4', 15 * MB)
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data['resource_type'], r.data['allowed_formats']), ('video', 'mp4,webm'))

    def test_rejeita_tipos_nao_permitidos(self):
        for nome, mime in [('doc.pdf', 'application/pdf'), ('x.gif', 'image/gif'),
                           ('falso.jpg', 'video/mp4'), ('script.svg', 'image/svg+xml')]:
            self.assertEqual(self.assinar(nome, mime).status_code, 400, nome)

    def test_rejeita_arquivo_grande(self):
        self.assertEqual(self.assinar(tamanho=11 * MB).status_code, 400)
        self.assertEqual(self.assinar('v.mp4', 'video/mp4', 101 * MB).status_code, 400)

    def test_nome_sanitizado(self):
        r = self.assinar(nome='../../etc/Fóto <script>alert(1)</script>.jpg')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('/', r.data['nome'])
        self.assertNotIn('<', r.data['nome'])
        self.assertTrue(r.data['nome'].endswith('.jpg'))

    def test_sem_cloudinary_configurado(self):
        with mock.patch.object(midia, 'configurado', return_value=False):
            self.assertEqual(self.assinar().status_code, 503)

    # ── confirmação ─────────────────────────────────────────────────────────
    def confirmar(self, public_id, meta=None, **extra):
        with mock.patch.object(midia, 'obter_metadados', return_value=meta) as m, \
             mock.patch.object(midia, 'apagar') as apagar:
            r = self.client.post(self.base, {'public_id': public_id, 'tipo': 'imagem', 'nome': 'a.jpg', **extra},
                                 format='json')
        return r, m, apagar

    def test_confirma_upload_e_lista_com_urls_assinadas(self):
        pid = f'{self.pasta}/abc'
        r, _, apagar = self.confirmar(pid, _meta(pid))
        self.assertEqual(r.status_code, 201, r.data)
        apagar.assert_not_called()
        self.assertIn('/authenticated/', r.data['url'])
        self.assertIn('s--', r.data['url'])  # URL assinada
        lista = self.client.get(self.base).data
        self.assertEqual(len(lista['anexos']), 1)
        self.assertEqual(lista['cota']['arquivos'], 1)
        resp = self.client.get('/api/v1/agendamentos/')
        self.assertEqual(resp.data['results'][0]['total_anexos'], 1)

    def test_rejeita_public_id_de_outra_pasta(self):
        r, m, _ = self.confirmar('agenda/e999/ag1/abc', _meta('agenda/e999/ag1/abc'))
        self.assertEqual(r.status_code, 400)
        m.assert_not_called()

    def test_formato_real_diferente_e_apagado(self):
        """Arquivo .jpg cujo conteúdo o Cloudinary detectou como outro formato."""
        pid = f'{self.pasta}/abc'
        r, _, apagar = self.confirmar(pid, _meta(pid, formato='gif'))
        self.assertEqual(r.status_code, 400)
        apagar.assert_called_once_with(pid, 'imagem')
        self.assertFalse(AnexoAgendamento.objects.exists())

    def test_tamanho_real_acima_do_limite_e_apagado(self):
        pid = f'{self.pasta}/abc'
        r, _, apagar = self.confirmar(pid, _meta(pid, tamanho=12 * MB))
        self.assertEqual(r.status_code, 400)
        apagar.assert_called_once()

    def test_upload_inexistente(self):
        r, _, _ = self.confirmar(f'{self.pasta}/nada', None)
        self.assertEqual(r.status_code, 400)

    def test_cota_de_arquivos(self):
        for i in range(3):
            pid = f'{self.pasta}/f{i}'
            self.assertEqual(self.confirmar(pid, _meta(pid))[0].status_code, 201)
        self.assertEqual(self.assinar().status_code, 400)
        pid = f'{self.pasta}/f9'
        r, _, apagar = self.confirmar(pid, _meta(pid))
        self.assertEqual(r.status_code, 400)
        apagar.assert_called_once()

    def test_cota_de_bytes(self):
        pid = f'{self.pasta}/grande'
        self.confirmar(pid, _meta(pid, tamanho=9 * MB))
        pid2 = f'{self.pasta}/grande2'
        self.confirmar(pid2, _meta(pid2, tamanho=9 * MB))
        self.assertEqual(self.assinar(tamanho=3 * MB).status_code, 400)

    def test_substituir(self):
        pid_antigo = f'{self.pasta}/antigo'
        antigo = self.confirmar(pid_antigo, _meta(pid_antigo))[0].data['id']
        pid_novo = f'{self.pasta}/novo'
        with mock.patch.object(midia, 'apagar') as apagar, self.captureOnCommitCallbacks(execute=True):
            with mock.patch.object(midia, 'obter_metadados', return_value=_meta(pid_novo)):
                r = self.client.post(self.base, {'public_id': pid_novo, 'tipo': 'imagem',
                                                 'substituir_id': antigo}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(list(AnexoAgendamento.objects.values_list('public_id', flat=True)), [pid_novo])
        apagar.assert_called_once_with(pid_antigo, 'imagem')

    def test_remover_apaga_arquivo_apos_commit(self):
        pid = f'{self.pasta}/x'
        anexo_id = self.confirmar(pid, _meta(pid))[0].data['id']
        with mock.patch.object(midia, 'apagar') as apagar, self.captureOnCommitCallbacks(execute=True):
            r = self.client.delete(f'{self.base}{anexo_id}/')
        self.assertEqual(r.status_code, 204)
        apagar.assert_called_once_with(pid, 'imagem')

    def test_excluir_agendamento_apaga_arquivos(self):
        for i in range(2):
            pid = f'{self.pasta}/c{i}'
            self.confirmar(pid, _meta(pid))
        with mock.patch.object(midia, 'apagar') as apagar, self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f'/api/v1/agendamentos/{self.ag.id}/')
        self.assertEqual(apagar.call_count, 2)

    # ── isolamento ──────────────────────────────────────────────────────────
    def test_outra_empresa_nao_acessa_anexos(self):
        pid = f'{self.pasta}/privado'
        anexo_id = self.confirmar(pid, _meta(pid))[0].data['id']
        intruso = criar_empresa('intruso')
        self.client.force_authenticate(intruso.owner)
        self.assertEqual(self.client.get(self.base).status_code, 404)
        self.assertEqual(self.assinar().status_code, 404)
        self.assertEqual(self.client.delete(f'{self.base}{anexo_id}/').status_code, 404)
        r, _, _ = self.confirmar(pid, _meta(pid))
        self.assertEqual(r.status_code, 404)
        self.assertEqual(AnexoAgendamento.objects.count(), 1)

    def test_anonimo_nao_acessa(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.base).status_code, 401)


class SanitizarNomeTests(APITestCase):
    def test_casos(self):
        self.assertEqual(midia.sanitizar_nome('C:\\Users\\x\\Minha Foto.JPG'), 'Minha Foto.JPG')
        self.assertEqual(midia.sanitizar_nome('ação.png'), 'acao.png')
        self.assertEqual(midia.sanitizar_nome('...'), 'arquivo')
        longo = midia.sanitizar_nome('a' * 300 + '.webp')
        self.assertLessEqual(len(longo), 100)
        self.assertTrue(longo.endswith('.webp'))


class LimparMidiaOrfaTests(APITestCase):
    def test_apaga_somente_orfaos_antigos(self):
        from io import StringIO
        from django.core.management import call_command
        emp = criar_empresa('orfa')
        ag = Agendamento.objects.create(
            empresa=emp, servico=criar_servico(emp), nome_cliente='C',
            whatsapp_cliente='85999990000', data_hora=amanha_as(9), duracao_total_min=30,
        )
        AnexoAgendamento.objects.create(empresa=emp, agendamento=ag, public_id='agenda/e1/ag1/conhecido',
                                        tipo='imagem', formato='jpg', bytes=10)
        recursos = {'resources': [
            {'public_id': 'agenda/e1/ag1/conhecido', 'created_at': '2020-01-01T00:00:00Z'},
            {'public_id': 'agenda/e1/ag1/orfao', 'created_at': '2020-01-01T00:00:00Z'},
            {'public_id': 'agenda/e1/ag1/recente', 'created_at': '2999-01-01T00:00:00Z'},
        ]}
        with mock.patch.object(midia, 'configurado', return_value=True), \
             mock.patch('cloudinary.api.resources', side_effect=[recursos, {'resources': []}]), \
             mock.patch.object(midia, 'apagar') as apagar:
            call_command('limpar_midia_orfa', stdout=StringIO())
        apagar.assert_called_once_with('agenda/e1/ag1/orfao', 'imagem')
