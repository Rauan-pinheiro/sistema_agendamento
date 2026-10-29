"""Modo demonstração: fotos de exemplo só no armazenamento local."""
import os
import tempfile

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from agendamentos import midia
from agendamentos.models import Empresa, MidiaServico


class PopularDemoTests(TestCase):
    def setUp(self):
        midia.provedor.cache_clear()
        self.addCleanup(midia.provedor.cache_clear)

    @override_settings(MIDIA_PROVEDOR='cloudinary', DEBUG=True)
    def test_recusa_sem_provedor_local(self):
        with self.assertRaises(CommandError):
            call_command('popular_demo', stdout=None)

    def test_cria_empresa_com_todas_as_fotos_e_outra_sem_nenhuma(self):
        with tempfile.TemporaryDirectory() as pasta, \
             override_settings(MIDIA_PROVEDOR='local', MIDIA_LOCAL_DIR=pasta, DEBUG=True):
            midia.provedor.cache_clear()
            call_command('popular_demo', stdout=open(os.devnull, "w"))
            lume = Empresa.objects.get(slug='demo-studio-lume')
            canto = Empresa.objects.get(slug='demo-canto-do-corte')
            self.assertTrue(lume.capa_public_id)
            self.assertEqual(MidiaServico.objects.filter(empresa=lume).count(), lume.servico_set.count())
            self.assertTrue(all(p.foto_public_id for p in lume.profissional_set.all()))
            self.assertFalse(canto.capa_public_id or canto.logo_public_id)
            self.assertFalse(MidiaServico.objects.filter(empresa=canto).exists())
            self.assertFalse(canto.profissional_set.exclude(foto_public_id='').exists())
            self.assertTrue(canto.agendamento_set.exists())
            pagina = self.client.get('/api/v1/public/demo-studio-lume/pagina/').json()
            self.assertIn('/midia-local/arquivo/upload/', pagina['empresa']['capa']['url'])
            self.assertIn('@640 640w', pagina['empresa']['capa']['srcset'])  # variante menor no celular
            # Rodar de novo recria sem duplicar
            call_command('popular_demo', stdout=open(os.devnull, "w"))
            self.assertEqual(Empresa.objects.filter(slug__startswith='demo-').count(), 2)
