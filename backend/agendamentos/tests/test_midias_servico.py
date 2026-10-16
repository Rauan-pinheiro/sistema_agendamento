"""Vitrine pública dos serviços ("Ver mais"): fotos, vídeos e YouTube."""
from unittest import mock

import cloudinary
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from agendamentos import midia
from agendamentos.models import MidiaServico

from .factories import criar_empresa, criar_servico

MB = 1024 * 1024
YT = 'dQw4w9WgXcQ'


@override_settings(MIDIA_MAX_ARQUIVOS_POR_SERVICO=2, MIDIA_MAX_YOUTUBE_POR_SERVICO=1)
class MidiasServicoTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._cfg = cloudinary.config().__dict__.copy()
        cloudinary.config(cloud_name='demo', api_key='123456', api_secret='segredo')

    @classmethod
    def tearDownClass(cls):
        cloudinary.config().__dict__.clear()
        cloudinary.config().__dict__.update(cls._cfg)
        super().tearDownClass()

    def setUp(self):
        cache.clear()
        self.emp = criar_empresa('vitrine')
        self.servico = criar_servico(self.emp, 'Corte')
        self.base = f'/api/v1/servicos/{self.servico.id}/midias/'
        self.pasta = midia.pasta_do_servico(self.emp.id, self.servico.id)
        self.client.force_authenticate(self.emp.owner)

    def pid(self, nome):
        return f'{self.pasta}/{nome.ljust(16, "x")[:16]}'

    def confirmar(self, pid, formato='jpg', tamanho=MB):
        meta = midia.Metadados(pid, 'imagem', formato, tamanho, 1200, 800, None)
        with mock.patch.object(midia, 'obter_metadados', return_value=meta) as obter, \
             mock.patch.object(midia, 'apagar') as apagar, \
             mock.patch.object(midia, 'promover_para_publico') as promover:
            r = self.client.post(self.base, {'public_id': pid, 'tipo': 'imagem'}, format='json')
        self.promover = promover
        return r, obter, apagar

    def test_upload_chega_privado(self):
        """A assinatura nunca permite upload público direto (evita hospedagem arbitrária)."""
        r = self.client.post(f'{self.base}assinatura/', {'nome': 'a.png', 'mime': 'image/png', 'tamanho': MB},
                             format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['type'], 'authenticated')
        self.assertTrue(r.data['public_id'].startswith(self.pasta + '/'))

    def test_confirma_imagem_com_url_publica(self):
        r, obter, _ = self.confirmar(self.pid('foto'))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertNotIn('entrega', obter.call_args.kwargs)  # lido ainda como privado
        self.promover.assert_called_once_with(self.pid('foto'), 'imagem')
        self.assertIn('/image/upload/', r.data['url'])
        self.assertNotIn('s--', r.data['url'])  # pública: sem assinatura na URL

    def test_formato_real_invalido_e_apagado(self):
        r, _, apagar = self.confirmar(self.pid('falso'), formato='svg')
        self.assertEqual(r.status_code, 400)
        apagar.assert_called_once()
        self.promover.assert_not_called()  # arquivo inválido nunca fica público

    def test_rejeita_upload_de_pasta_de_agendamento(self):
        pid = midia.pasta_do_agendamento(self.emp.id, 1) + '/xxxxxxxxxxxxxxxx'
        r, obter, _ = self.confirmar(pid)
        self.assertEqual(r.status_code, 400)
        obter.assert_not_called()

    def test_cota_de_arquivos(self):
        self.confirmar(self.pid('a'))
        self.confirmar(self.pid('b'))
        r, _, apagar = self.confirmar(self.pid('c'))
        self.assertEqual(r.status_code, 400)
        apagar.assert_called_once()

    def test_falha_ao_promover_nao_registra(self):
        pid = self.pid('falha')
        meta = midia.Metadados(pid, 'imagem', 'jpg', MB, 10, 10, None)
        with mock.patch.object(midia, 'obter_metadados', return_value=meta), \
             mock.patch.object(midia, 'promover_para_publico', side_effect=midia.MidiaIndisponivel('x')):
            r = self.client.post(self.base, {'public_id': pid, 'tipo': 'imagem'}, format='json')
        self.assertEqual(r.status_code, 503)
        self.assertFalse(MidiaServico.objects.exists())

    def test_youtube_valido_guarda_so_o_id(self):
        r = self.client.post(self.base, {'youtube_url': f'https://youtu.be/{YT}?si=x'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['youtube_id'], YT)
        self.assertEqual(r.data['embed_url'], f'https://www.youtube-nocookie.com/embed/{YT}')
        self.assertIn('i.ytimg.com', r.data['thumb_url'])

    def test_youtube_invalido(self):
        r = self.client.post(self.base, {'youtube_url': 'https://vimeo.com/123'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('youtube_url', r.data)

    def test_cota_youtube(self):
        self.client.post(self.base, {'youtube_url': f'youtu.be/{YT}'}, format='json')
        r = self.client.post(self.base, {'youtube_url': f'youtu.be/{YT}'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_reordenar(self):
        a = self.confirmar(self.pid('a'))[0].data['id']
        b = self.client.post(self.base, {'youtube_url': f'youtu.be/{YT}'}, format='json').data['id']
        r = self.client.patch(f'{self.base}ordem/', {'ids': [b, a]}, format='json')
        self.assertEqual([m['id'] for m in r.data], [b, a])
        self.assertEqual(self.client.patch(f'{self.base}ordem/', {'ids': [a]}, format='json').status_code, 400)

    def test_remover_apaga_arquivo(self):
        mid = self.confirmar(self.pid('a'))[0].data['id']
        with mock.patch.object(midia, 'apagar') as apagar, self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(f'{self.base}{mid}/').status_code, 204)
        apagar.assert_called_once()

    def test_remover_youtube_nao_chama_cloudinary(self):
        mid = self.client.post(self.base, {'youtube_url': f'youtu.be/{YT}'}, format='json').data['id']
        with mock.patch.object(midia, 'apagar') as apagar, self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f'{self.base}{mid}/')
        apagar.assert_not_called()

    def test_outra_empresa_nao_mexe_na_vitrine(self):
        self.confirmar(self.pid('a'))
        self.client.force_authenticate(criar_empresa('outra').owner)
        self.assertEqual(self.client.get(self.base).status_code, 404)
        r = self.client.post(self.base, {'youtube_url': f'youtu.be/{YT}'}, format='json')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(MidiaServico.objects.count(), 1)

    def test_pagina_publica_inclui_midias_e_invalida_cache(self):
        url = '/api/v1/public/vitrine/pagina/'
        self.assertEqual(self.client.get(url).data['servicos'][0]['midias'], [])
        self.confirmar(self.pid('a'))
        self.client.post(self.base, {'youtube_url': f'youtu.be/{YT}'}, format='json')
        self.client.force_authenticate(None)
        midias = self.client.get(url).data['servicos'][0]['midias']
        self.assertEqual([m['tipo'] for m in midias], ['imagem', 'youtube'])
        self.assertNotIn('bytes', midias[0])          # público não expõe metadados internos
        self.assertNotIn('nome_original', midias[0])
