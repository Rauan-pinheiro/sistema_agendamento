"""
Isolamento multi-tenant: o dono da empresa A tenta ler, alterar, apagar e
referenciar dados da empresa B por todas as rotas privadas. Tudo deve falhar
(404 ou 400) e os dados de B devem continuar intactos.
"""
from datetime import time
from unittest import mock

from rest_framework.test import APITestCase

from agendamentos import midia
from agendamentos.models import (
    Agendamento, AnexoAgendamento, Empresa, HorarioFuncionamento, MidiaServico, Profissional, Servico,
)

from .factories import amanha_as, criar_empresa, criar_grade_semana, criar_profissional, criar_servico


class AtaqueEntreEmpresasTests(APITestCase):
    def setUp(self):
        self.a = criar_empresa('empresa-a')
        self.b = criar_empresa('empresa-b')
        criar_grade_semana(self.a)
        self.serv_a = criar_servico(self.a, 'Serviço A')
        self.serv_b = criar_servico(self.b, 'Serviço B')
        self.prof_b = criar_profissional(self.b, 'Profissional B')
        self.grade_b = HorarioFuncionamento.objects.create(
            empresa=self.b, dia_semana=0, hora_inicio=time(8), hora_fim=time(12),
        )
        self.ag_b = Agendamento.objects.create(
            empresa=self.b, servico=self.serv_b, profissional=self.prof_b, nome_cliente='Cliente B',
            whatsapp_cliente='85999990000', data_hora=amanha_as(10), duracao_total_min=30,
        )
        self.anexo_b = AnexoAgendamento.objects.create(
            empresa=self.b, agendamento=self.ag_b, public_id='agenda/x/abcdefghijklmnop', tipo='imagem',
            formato='jpg', bytes=100, nome_original='b.jpg',
        )
        self.midia_b = MidiaServico.objects.create(
            empresa=self.b, servico=self.serv_b, tipo='youtube', youtube_id='dQw4w9WgXcQ', ordem=0,
        )
        self.client.force_authenticate(self.a.owner)

    def test_listagens_nao_mostram_nada_de_b(self):
        for url in ['/api/v1/servicos/', '/api/v1/profissionais/', '/api/v1/agendamentos/']:
            ids = [item['id'] for item in self.client.get(url).data['results']]
            self.assertNotIn(self.serv_b.id if 'servicos' in url else
                             self.prof_b.id if 'profissionais' in url else self.ag_b.id, ids, url)
        horarios = self.client.get('/api/v1/horarios/').data
        self.assertNotIn(self.grade_b.id, [h['id'] for h in horarios])
        empresas = self.client.get('/api/v1/empresa/').data
        self.assertEqual([e['id'] for e in empresas], [self.a.id])
        self.assertEqual(self.client.get('/api/v1/agendamentos/resumo/').data['hoje'], 0)

    def test_detalhe_alteracao_e_exclusao_de_b_retornam_404(self):
        rotas = {
            f'/api/v1/servicos/{self.serv_b.id}/': {'nome': 'Invadido'},
            f'/api/v1/profissionais/{self.prof_b.id}/': {'nome': 'Invadido'},
            f'/api/v1/horarios/{self.grade_b.id}/': {'hora_fim': '13:00'},
            f'/api/v1/agendamentos/{self.ag_b.id}/': {'nome_cliente': 'Invadido'},
            f'/api/v1/empresa/{self.b.id}/': {'nome_fantasia': 'Invadida'},
        }
        for url, dados in rotas.items():
            self.assertEqual(self.client.get(url).status_code, 404, f'GET {url}')
            self.assertEqual(self.client.patch(url, dados, format='json').status_code, 404, f'PATCH {url}')
            self.assertEqual(self.client.put(url, dados, format='json').status_code, 404, f'PUT {url}')
            if 'empresa' not in url:
                self.assertEqual(self.client.delete(url).status_code, 404, f'DELETE {url}')

    def test_acoes_de_midia_e_status_de_b_retornam_404(self):
        ag, serv = self.ag_b.id, self.serv_b.id
        with mock.patch.object(midia, 'apagar'), mock.patch.object(midia, 'configurado', return_value=True):
            chamadas = [
                ('patch', f'/api/v1/agendamentos/{ag}/status/', {'status': 'cancelado'}),
                ('get', f'/api/v1/agendamentos/{ag}/anexos/', None),
                ('post', f'/api/v1/agendamentos/{ag}/anexos/', {'public_id': 'x', 'tipo': 'imagem', 'nome': 'a.jpg'}),
                ('post', f'/api/v1/agendamentos/{ag}/anexos/assinatura/', {'nome': 'a.jpg', 'tipo': 'image/jpeg', 'tamanho': 10}),
                ('delete', f'/api/v1/agendamentos/{ag}/anexos/{self.anexo_b.id}/', None),
                ('get', f'/api/v1/servicos/{serv}/midias/', None),
                ('post', f'/api/v1/servicos/{serv}/midias/', {'youtube_url': 'https://youtu.be/dQw4w9WgXcQ'}),
                ('post', f'/api/v1/servicos/{serv}/midias/assinatura/', {'nome': 'a.jpg', 'tipo': 'image/jpeg', 'tamanho': 10}),
                ('patch', f'/api/v1/servicos/{serv}/midias/ordem/', {'ids': [self.midia_b.id]}),
                ('delete', f'/api/v1/servicos/{serv}/midias/{self.midia_b.id}/', None),
            ]
            for metodo, url, dados in chamadas:
                resp = getattr(self.client, metodo)(url, dados, format='json')
                self.assertEqual(resp.status_code, 404, f'{metodo.upper()} {url}: {resp.status_code}')

    def test_nao_referencia_servico_ou_profissional_de_b(self):
        base = {'nome_cliente': 'Fulano', 'whatsapp_cliente': '85999990000', 'data_hora': amanha_as(9).isoformat()}
        r1 = self.client.post('/api/v1/agendamentos/', {**base, 'servicos_ids': [self.serv_b.id]}, format='json')
        r2 = self.client.post('/api/v1/agendamentos/', {
            **base, 'servicos_ids': [self.serv_a.id], 'profissional': self.prof_b.id,
        }, format='json')
        r3 = self.client.post('/api/v1/horarios/', {
            'profissional': self.prof_b.id, 'dia_semana': 1, 'hora_inicio': '08:00', 'hora_fim': '12:00',
        }, format='json')
        self.assertEqual((r1.status_code, r2.status_code, r3.status_code), (400, 400, 400))
        self.assertFalse(HorarioFuncionamento.objects.filter(empresa=self.a, profissional=self.prof_b).exists())

    def test_pagina_publica_de_a_nao_aceita_itens_de_b(self):
        self.client.force_authenticate(None)
        resp = self.client.post('/api/v1/public/empresa-a/agendamentos/', {
            'servicos_ids': [self.serv_b.id], 'nome_cliente': 'Fulano',
            'whatsapp_cliente': '85999990000', 'data_hora': amanha_as(9).isoformat(),
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        slots = self.client.get(
            f'/api/v1/public/empresa-a/horarios-disponiveis/?data={amanha_as(9).date()}'
            f'&servicos_ids={self.serv_b.id}&profissional_id={self.prof_b.id}'
        )
        self.assertEqual(slots.status_code, 200)  # ignora os IDs de B e usa a grade de A

    def tearDown(self):
        # Nada de B foi alterado
        self.ag_b.refresh_from_db()
        self.assertEqual((self.ag_b.status, self.ag_b.nome_cliente), ('pendente', 'Cliente B'))
        self.assertEqual(Servico.objects.get(pk=self.serv_b.pk).nome, 'Serviço B')
        self.assertEqual(Profissional.objects.get(pk=self.prof_b.pk).nome, 'Profissional B')
        self.assertEqual(Empresa.objects.get(pk=self.b.pk).nome_fantasia, 'Empresa empresa-b')
        self.assertTrue(AnexoAgendamento.objects.filter(pk=self.anexo_b.pk).exists())
        self.assertTrue(MidiaServico.objects.filter(pk=self.midia_b.pk).exists())
        self.assertEqual(HorarioFuncionamento.objects.get(pk=self.grade_b.pk).hora_fim, time(12))


class UsuarioSemEmpresaTests(APITestCase):
    def test_usuario_sem_empresa_nao_ve_dados(self):
        from django.contrib.auth.models import User
        criar_servico(criar_empresa('alguma'), 'Serviço')
        self.client.force_authenticate(User.objects.create_user('solto', password='x'))
        for url in ['/api/v1/servicos/', '/api/v1/agendamentos/', '/api/v1/financeiro/resumo/']:
            self.assertEqual(self.client.get(url).status_code, 404, url)


class GradeSegundaFeiraTests(APITestCase):
    def test_nao_duplica_grade_de_segunda(self):
        emp = criar_empresa('seg')
        self.client.force_authenticate(emp.owner)
        dados = {'dia_semana': 0, 'hora_inicio': '08:00', 'hora_fim': '12:00'}
        self.assertEqual(self.client.post('/api/v1/horarios/', dados, format='json').status_code, 201)
        self.assertEqual(self.client.post('/api/v1/horarios/', dados, format='json').status_code, 400)
