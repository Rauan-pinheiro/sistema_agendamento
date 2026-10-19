"""LGPD: aceite dos termos, portabilidade (exportação), exclusão da conta e dos dados de um cliente."""
from unittest import mock

from django.conf import settings
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from agendamentos import midia
from agendamentos.models import Agendamento, AnexoAgendamento, Empresa, Servico

from .factories import SENHA, amanha_as, criar_empresa, criar_servico

REGISTRO = {
    'username': 'nova_dona', 'email': 'nova@teste.com', 'password': SENHA, 'password_confirm': SENHA,
    'nome_fantasia': 'Salão Nova', 'slug': 'salao-nova', 'whatsapp_contato': '85999990000',
}


class AceiteTermosTests(APITestCase):
    def test_cadastro_exige_aceite_dos_termos(self):
        resp = self.client.post('/api/v1/auth/registro/', REGISTRO)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('aceite_termos', resp.data)
        resp = self.client.post('/api/v1/auth/registro/', {**REGISTRO, 'aceite_termos': False})
        self.assertEqual(resp.status_code, 400)

    def test_cadastro_registra_data_e_versao_do_aceite(self):
        resp = self.client.post('/api/v1/auth/registro/', {**REGISTRO, 'aceite_termos': True})
        self.assertEqual(resp.status_code, 201, resp.data)
        emp = Empresa.objects.get(slug='salao-nova')
        self.assertIsNotNone(emp.termos_aceitos_em)
        self.assertEqual(emp.termos_versao, settings.TERMOS_VERSAO)


class ContaTests(APITestCase):
    def setUp(self):
        self.emp = criar_empresa('dona')
        self.outra = criar_empresa('outra')
        self.serv = criar_servico(self.emp)
        self.ag = Agendamento.objects.create(
            empresa=self.emp, servico=self.serv, nome_cliente='Maria Cliente',
            whatsapp_cliente='85988887777', data_hora=amanha_as(10), duracao_total_min=30,
        )
        AnexoAgendamento.objects.create(
            empresa=self.emp, agendamento=self.ag, public_id='agenda/e1/ag1/abcdefghijklmnop',
            tipo='imagem', formato='jpg', bytes=10, nome_original='foto.jpg',
        )
        self.client.force_authenticate(self.emp.owner)

    def test_exporta_todos_os_dados_da_empresa(self):
        resp = self.client.get('/api/v1/conta/exportar/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('attachment', resp['Content-Disposition'])
        dados = resp.json()
        self.assertEqual(dados['empresa']['slug'], 'dona')
        self.assertEqual(dados['usuario']['email'], 'dona@teste.com')
        self.assertEqual([s['nome'] for s in dados['servicos']], ['Corte'])
        self.assertEqual(dados['agendamentos'][0]['nome_cliente'], 'Maria Cliente')
        self.assertNotIn('password', str(dados))

    def test_excluir_conta_exige_senha(self):
        resp = self.client.delete('/api/v1/conta/', {'password': 'errada'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(User.objects.filter(pk=self.emp.owner.pk).exists())

    def test_excluir_conta_apaga_tudo_inclusive_arquivos(self):
        with mock.patch.object(midia, 'apagar') as apagar, self.captureOnCommitCallbacks(execute=True):
            resp = self.client.delete('/api/v1/conta/', {'password': SENHA}, format='json')
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(User.objects.filter(username='dono_dona').exists())
        self.assertFalse(Empresa.objects.filter(slug='dona').exists())
        self.assertFalse(Agendamento.objects.filter(empresa_id=self.emp.id).exists())
        self.assertFalse(Servico.objects.filter(empresa_id=self.emp.id).exists())
        apagar.assert_called_once_with('agenda/e1/ag1/abcdefghijklmnop', 'imagem')
        self.assertTrue(Empresa.objects.filter(slug='outra').exists())  # outra empresa intacta

    def test_anonimiza_dados_de_um_cliente(self):
        Agendamento.objects.create(
            empresa=self.outra, servico=criar_servico(self.outra), nome_cliente='Maria na outra',
            whatsapp_cliente='85988887777', data_hora=amanha_as(11), duracao_total_min=30,
        )
        with mock.patch.object(midia, 'apagar') as apagar, self.captureOnCommitCallbacks(execute=True):
            resp = self.client.post('/api/v1/clientes/anonimizar/', {'whatsapp': '(85) 98888-7777'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['agendamentos'], 1)
        self.ag.refresh_from_db()
        self.assertNotIn('Maria', self.ag.nome_cliente)
        self.assertEqual(self.ag.whatsapp_cliente, '')
        self.assertFalse(AnexoAgendamento.objects.filter(agendamento=self.ag).exists())
        apagar.assert_called_once()
        # Só na própria empresa: o mesmo cliente em outra empresa não é tocado
        self.assertTrue(Agendamento.objects.filter(empresa=self.outra, nome_cliente='Maria na outra').exists())

    def test_anonimizar_valida_telefone(self):
        resp = self.client.post('/api/v1/clientes/anonimizar/', {'whatsapp': '123'}, format='json')
        self.assertEqual(resp.status_code, 400)
