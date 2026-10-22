"""Suspender um cliente = desmarcar "Ativo" no usuário dono (admin). Ver docs/06."""
from django.contrib.auth.models import Permission, User
from django.core.cache import cache
from rest_framework.test import APITestCase

from agendamentos.models import Agendamento

from .factories import SENHA, amanha_as, criar_empresa, criar_grade_semana, criar_servico


class SuspensaoTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.emp = criar_empresa('studio')
        self.corte = criar_servico(self.emp)
        criar_grade_semana(self.emp)
        self.dono = self.emp.owner

    def _suspender(self, ativo=False):
        self.dono.is_active = ativo
        self.dono.save()

    def _publicas(self):
        data = amanha_as(10).date().isoformat()
        return [
            self.client.get('/api/v1/public/studio/pagina/'),
            self.client.get('/api/v1/public/studio/'),
            self.client.get('/api/v1/public/studio/servicos/'),
            self.client.get('/api/v1/public/studio/profissionais/'),
            self.client.get(f'/api/v1/public/studio/horarios-disponiveis/?data={data}&servicos_ids={self.corte.id}'),
            self.client.post('/api/v1/public/studio/agendamentos/', {
                'servicos_ids': [self.corte.id], 'nome_cliente': 'Ana', 'whatsapp_cliente': '85988887777',
                'data_hora': amanha_as(10).isoformat(),
            }, format='json'),
        ]

    def test_conta_suspensa_some_da_pagina_publica_e_nao_recebe_reservas(self):
        self.assertEqual(self.client.get('/api/v1/public/studio/pagina/').status_code, 200)  # entra no cache
        self._suspender()
        self.assertEqual([r.status_code for r in self._publicas()], [404] * 6)
        self.assertFalse(Agendamento.objects.exists())

    def test_conta_suspensa_nao_entra_no_painel(self):
        token = self.client.post('/api/v1/auth/token/', {'username': self.dono.username, 'password': SENHA}).data['access']
        self._suspender()
        self.assertEqual(
            self.client.post('/api/v1/auth/token/', {'username': self.dono.username, 'password': SENHA}).status_code, 401,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(self.client.get('/api/v1/agendamentos/').status_code, 401)

    def test_reativar_devolve_tudo(self):
        self._suspender()
        self._suspender(ativo=True)
        self.assertEqual([r.status_code for r in self._publicas()], [200, 200, 200, 200, 200, 201])


class AdminSuspensaoTests(APITestCase):
    def test_acoes_do_admin_suspendem_e_reativam(self):
        cache.clear()
        emp = criar_empresa('studio')
        admin_user = User.objects.create_superuser('root', 'root@x.com', SENHA)
        self.client.force_login(admin_user)
        url = '/admin/agendamentos/empresa/'
        r = self.client.post(url, {'action': 'suspender', '_selected_action': [emp.pk]})
        self.assertEqual(r.status_code, 302)
        emp.owner.refresh_from_db()
        self.assertFalse(emp.owner.is_active)
        self.assertEqual(self.client.get('/api/v1/public/studio/pagina/').status_code, 404)
        self.client.post(url, {'action': 'reativar', '_selected_action': [emp.pk]})
        emp.owner.refresh_from_db()
        self.assertTrue(emp.owner.is_active)
        self.assertEqual(self.client.get(url + '?q=studio').status_code, 200)

    def test_equipe_sem_permissao_de_alterar_usuarios_nao_suspende(self):
        cache.clear()
        emp = criar_empresa('studio')
        atendente = User.objects.create_user('atendente', 'a@x.com', SENHA, is_staff=True)
        atendente.user_permissions.add(*Permission.objects.filter(codename__in=['view_empresa', 'change_empresa']))
        self.client.force_login(atendente)
        self.client.post('/admin/agendamentos/empresa/', {'action': 'suspender', '_selected_action': [emp.pk]})
        emp.owner.refresh_from_db()
        self.assertTrue(emp.owner.is_active)

    def test_nao_suspende_conta_da_equipe(self):
        cache.clear()
        emp = criar_empresa('studio')
        emp.owner.is_staff = True
        emp.owner.save()
        self.client.force_login(User.objects.create_superuser('root', 'root@x.com', SENHA))
        self.client.post('/admin/agendamentos/empresa/', {'action': 'suspender', '_selected_action': [emp.pk]})
        emp.owner.refresh_from_db()
        self.assertTrue(emp.owner.is_active)
