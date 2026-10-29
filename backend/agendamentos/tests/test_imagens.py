"""Capa e logo da empresa e foto do profissional (página pública, Direção B)."""
from unittest import mock

import cloudinary
from django.core.cache import cache
from rest_framework.test import APITestCase

from agendamentos import midia
from agendamentos.models import Profissional

from .factories import criar_empresa

MB = 1024 * 1024


class ImagensTests(APITestCase):
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
        self.emp = criar_empresa('lume')
        self.pro = Profissional.objects.create(empresa=self.emp, nome='Carla Menezes')
        self.client.force_authenticate(self.emp.owner)
        self.pasta = midia.pasta_da_empresa(self.emp.id)

    def confirmar(self, url, pid, formato='webp', tamanho=MB):
        meta = midia.Metadados(pid, 'imagem', formato, tamanho, 1600, 900, None)
        with mock.patch.object(midia, 'obter_metadados', return_value=meta), \
             mock.patch.object(midia, 'apagar') as apagar, \
             mock.patch.object(midia, 'promover_para_publico') as promover, \
             self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(url, {'public_id': pid}, format='json')
        return r, apagar, promover

    def test_assinatura_so_aceita_imagem_e_chega_privada(self):
        base = f'/api/v1/empresa/{self.emp.id}/capa/assinatura/'
        r = self.client.post(base, {'nome': 'capa.jpg', 'mime': 'image/jpeg', 'tamanho': MB}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['type'], 'authenticated')
        self.assertTrue(r.data['public_id'].startswith(self.pasta + '/'))
        r = self.client.post(base, {'nome': 'v.mp4', 'mime': 'video/mp4', 'tamanho': MB}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_capa_vira_publica_em_srcset_e_aparece_na_pagina(self):
        pid = f'{self.pasta}/{"a" * 16}'
        r, _, promover = self.confirmar(f'/api/v1/empresa/{self.emp.id}/capa/', pid)
        self.assertEqual(r.status_code, 200, r.data)
        promover.assert_called_once_with(pid, 'imagem')
        self.assertIn('w_640', r.data['capa']['srcset'])
        self.assertIn('1600w', r.data['capa']['srcset'])
        self.assertIsNone(r.data['logo_url'])
        pagina = self.client.get('/api/v1/public/lume/pagina/').data
        self.assertIn(pid, pagina['empresa']['capa']['url'])

    def test_trocar_apaga_a_antiga_e_delete_remove(self):
        url = f'/api/v1/empresa/{self.emp.id}/logo/'
        a, b = f'{self.pasta}/{"a" * 16}', f'{self.pasta}/{"b" * 16}'
        self.confirmar(url, a)
        _, apagar, _ = self.confirmar(url, b)
        apagar.assert_called_once_with(a, 'imagem', entrega=midia.ENTREGA_PUBLICA)
        with mock.patch.object(midia, 'apagar') as apagar, self.captureOnCommitCallbacks(execute=True):
            r = self.client.delete(url)
        self.assertIsNone(r.data['logo_url'])
        apagar.assert_called_once_with(b, 'imagem', entrega=midia.ENTREGA_PUBLICA)

    def test_recusa_public_id_de_outra_pasta_e_formato_errado(self):
        url = f'/api/v1/empresa/{self.emp.id}/capa/'
        outra = midia.pasta_da_empresa(self.emp.id + 1)
        r, _, _ = self.confirmar(url, f'{outra}/{"a" * 16}')
        self.assertEqual(r.status_code, 400)
        r, apagar, promover = self.confirmar(url, f'{self.pasta}/{"c" * 16}', formato='mp4')
        self.assertEqual(r.status_code, 400)
        promover.assert_not_called()
        apagar.assert_called_once()

    def test_outra_empresa_nao_altera(self):
        intrusa = criar_empresa('intrusa')
        self.client.force_authenticate(intrusa.owner)
        r = self.client.post(f'/api/v1/profissionais/{self.pro.id}/foto/assinatura/',
                             {'nome': 'f.jpg', 'mime': 'image/jpeg', 'tamanho': MB}, format='json')
        self.assertEqual(r.status_code, 404)
        r = self.client.post(f'/api/v1/empresa/{self.emp.id}/capa/assinatura/',
                             {'nome': 'f.jpg', 'mime': 'image/jpeg', 'tamanho': MB}, format='json')
        self.assertEqual(r.status_code, 404)

    def test_foto_do_profissional_na_pagina_e_apagada_com_ele(self):
        pid = f'{midia.pasta_do_profissional(self.emp.id, self.pro.id)}/{"f" * 16}'
        r, _, _ = self.confirmar(f'/api/v1/profissionais/{self.pro.id}/foto/', pid)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('c_fill', r.data['foto_url'])
        pagina = self.client.get('/api/v1/public/lume/pagina/').data
        self.assertIn(pid, pagina['profissionais'][0]['foto_url'])
        with mock.patch.object(midia, 'apagar') as apagar, self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f'/api/v1/profissionais/{self.pro.id}/')
        apagar.assert_called_once_with(pid, 'imagem', entrega=midia.ENTREGA_PUBLICA)

    def test_sem_fotos_a_pagina_traz_nulos(self):
        pagina = self.client.get('/api/v1/public/lume/pagina/').data
        self.assertIsNone(pagina['empresa']['capa'])
        self.assertIsNone(pagina['empresa']['logo_url'])
        self.assertIsNone(pagina['profissionais'][0]['foto_url'])
