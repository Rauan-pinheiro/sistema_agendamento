"""
Testes de integração da API — caracterizam o comportamento atual
(autenticação, isolamento multi-tenant, fluxo público de agendamento).
"""
from datetime import time, timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from agendamentos.models import Agendamento, HorarioFuncionamento

from .factories import (
    SENHA, amanha_as, criar_empresa, criar_grade_semana, criar_profissional, criar_servico,
)


class AuthTests(APITestCase):
    def test_registro_cria_usuario_empresa_e_retorna_tokens(self):
        resp = self.client.post('/api/v1/auth/registro/', {
            'username': 'novo_dono', 'email': 'Novo@Teste.com',
            'password': SENHA, 'password_confirm': SENHA,
            'nome_fantasia': 'Barbearia Nova', 'slug': 'barbearia-nova',
            'whatsapp_contato': '(85) 99999-0000', 'aceite_termos': True,
        })
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertIn('access', resp.data)
        self.assertEqual(resp.data['empresa']['whatsapp_contato'], '85999990000')

    def test_registro_rejeita_slug_duplicado(self):
        criar_empresa('ocupado')
        resp = self.client.post('/api/v1/auth/registro/', {
            'username': 'outro', 'email': 'o@t.com', 'password': SENHA,
            'password_confirm': SENHA, 'nome_fantasia': 'X Y', 'slug': 'ocupado',
            'whatsapp_contato': '85999990000',
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn('slug', resp.data)

    def test_registro_rejeita_senha_fraca(self):
        for fraca in ['12345678', 'password', 'novo_dono1']:
            resp = self.client.post('/api/v1/auth/registro/', {
                'username': 'novo_dono1', 'email': 'n@t.com', 'password': fraca,
                'password_confirm': fraca, 'nome_fantasia': 'X Y', 'slug': 'xy-fraca',
                'whatsapp_contato': '85999990000', 'aceite_termos': True,
            })
            self.assertEqual(resp.status_code, 400, fraca)
            self.assertIn('password', resp.data)

    def test_troca_de_senha_rejeita_senha_fraca(self):
        emp = criar_empresa()
        self.client.force_authenticate(emp.owner)
        resp = self.client.patch('/api/v1/usuario/', {
            'password_atual': SENHA, 'password_nova': '12345678', 'password_nova_confirm': '12345678',
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn('password_nova', resp.data)

    def test_login_retorna_tokens(self):
        emp = criar_empresa()
        resp = self.client.post('/api/v1/auth/token/', {
            'username': emp.owner.username, 'password': SENHA,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIn('refresh', resp.data)

    def test_login_senha_errada(self):
        emp = criar_empresa()
        resp = self.client.post('/api/v1/auth/token/', {
            'username': emp.owner.username, 'password': 'errada',
        })
        self.assertEqual(resp.status_code, 401)

    def test_rotas_privadas_exigem_autenticacao(self):
        for url in ['/api/v1/agendamentos/', '/api/v1/servicos/', '/api/v1/financeiro/resumo/']:
            self.assertEqual(self.client.get(url).status_code, 401, url)


class IsolamentoMultiTenantTests(APITestCase):
    def setUp(self):
        self.emp_a = criar_empresa('empresa-a')
        self.emp_b = criar_empresa('empresa-b')
        self.serv_b = criar_servico(self.emp_b, 'Serviço B')
        self.ag_b = Agendamento.objects.create(
            empresa=self.emp_b, servico=self.serv_b, nome_cliente='Cliente B',
            whatsapp_cliente='85999990000', data_hora=amanha_as(10), duracao_total_min=30,
        )
        self.client.force_authenticate(self.emp_a.owner)

    def test_nao_lista_dados_de_outra_empresa(self):
        self.assertEqual(self.client.get('/api/v1/servicos/').data['count'], 0)
        self.assertEqual(self.client.get('/api/v1/agendamentos/').data['count'], 0)

    def test_nao_acessa_nem_altera_agendamento_de_outra_empresa(self):
        url = f'/api/v1/agendamentos/{self.ag_b.id}/'
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)
        resp = self.client.patch(f'{url}status/', {'status': 'cancelado'})
        self.assertEqual(resp.status_code, 404)
        self.ag_b.refresh_from_db()
        self.assertEqual(self.ag_b.status, 'pendente')

    def test_nao_usa_servico_de_outra_empresa(self):
        criar_grade_semana(self.emp_a)
        resp = self.client.post('/api/v1/agendamentos/', {
            'servicos_ids': [self.serv_b.id], 'nome_cliente': 'Fulano',
            'whatsapp_cliente': '85999990000', 'data_hora': amanha_as(9).isoformat(),
        }, format='json')
        self.assertEqual(resp.status_code, 400)


class AgendamentoPublicoTests(APITestCase):
    def setUp(self):
        self.emp = criar_empresa('barbearia')
        self.corte = criar_servico(self.emp, 'Corte', 30, '35.00')
        self.barba = criar_servico(self.emp, 'Barba', 20, '25.00')
        criar_grade_semana(self.emp)
        self.url = '/api/v1/public/barbearia/agendamentos/'

    def payload(self, **extra):
        base = {
            'servicos_ids': [self.corte.id, self.barba.id],
            'nome_cliente': 'Maria', 'whatsapp_cliente': '(85) 98888-7777',
            'data_hora': amanha_as(10).isoformat(),
        }
        base.update(extra)
        return base

    def test_cria_agendamento_multi_servico_com_totais(self):
        resp = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        ag = Agendamento.objects.get()
        self.assertEqual(ag.duracao_total_min, 50)
        self.assertEqual(ag.preco_total, Decimal('60.00'))
        self.assertEqual([s['nome'] for s in resp.data['servicos_info']], ['Corte', 'Barba'])

    def test_rejeita_horario_no_passado(self):
        passado = (timezone.now() - timedelta(hours=1)).isoformat()
        resp = self.client.post(self.url, self.payload(data_hora=passado), format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('data_hora', resp.data)

    def test_rejeita_conflito_de_horario(self):
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 201)
        # 10:30 sobrepõe o agendamento 10:00–10:50
        resp = self.client.post(
            self.url, self.payload(data_hora=amanha_as(10, 30).isoformat()), format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('data_hora', resp.data)

    def test_permite_horario_adjacente(self):
        self.client.post(self.url, self.payload(), format='json')
        resp = self.client.post(
            self.url, self.payload(data_hora=amanha_as(10, 50).isoformat()), format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_cancelado_libera_horario(self):
        self.client.post(self.url, self.payload(), format='json')
        Agendamento.objects.update(status='cancelado')
        resp = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(resp.status_code, 201)

    def test_whatsapp_invalido(self):
        resp = self.client.post(self.url, self.payload(whatsapp_cliente='123'), format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('whatsapp_cliente', resp.data)

    def test_slug_inexistente(self):
        resp = self.client.post('/api/v1/public/nao-existe/agendamentos/', self.payload(), format='json')
        self.assertEqual(resp.status_code, 404)

    def test_profissionais_diferentes_nao_conflitam(self):
        p1 = criar_profissional(self.emp, 'Ana')
        p2 = criar_profissional(self.emp, 'Bia')
        r1 = self.client.post(self.url, self.payload(profissional=p1.id), format='json')
        r2 = self.client.post(self.url, self.payload(profissional=p2.id), format='json')
        self.assertEqual((r1.status_code, r2.status_code), (201, 201))


class ValidacaoReservaNaGradeTests(APITestCase):
    """A API (não só o front) recusa reservas fora da grade e com profissional inválido."""

    def setUp(self):
        self.emp = criar_empresa('salao')
        self.corte = criar_servico(self.emp, 'Corte', 30, '35.00')
        criar_grade_semana(self.emp)  # 08:00–18:00 todos os dias
        self.url = '/api/v1/public/salao/agendamentos/'

    def reservar(self, quando, **extra):
        payload = {
            'servicos_ids': [self.corte.id], 'nome_cliente': 'Ana',
            'whatsapp_cliente': '85988887777', 'data_hora': quando.isoformat(),
        }
        payload.update(extra)
        return self.client.post(self.url, payload, format='json')

    def test_rejeita_antes_da_abertura(self):
        resp = self.reservar(amanha_as(7, 30))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('data_hora', resp.data)

    def test_rejeita_quando_termina_depois_do_fechamento(self):
        resp = self.reservar(amanha_as(17, 45))  # 30 min → 18:15
        self.assertEqual(resp.status_code, 400)
        self.assertIn('data_hora', resp.data)

    def test_aceita_ultimo_horario_que_cabe(self):
        self.assertEqual(self.reservar(amanha_as(17, 30)).status_code, 201)

    def test_rejeita_dia_fechado(self):
        HorarioFuncionamento.objects.filter(empresa=self.emp, dia_semana=amanha_as(10).weekday()).delete()
        resp = self.reservar(amanha_as(10))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('data_hora', resp.data)

    def test_rejeita_profissional_inativo(self):
        ativo = criar_profissional(self.emp, 'Ativa')
        inativo = criar_profissional(self.emp, 'Inativa')
        inativo.ativo = False
        inativo.save()
        resp = self.reservar(amanha_as(10), profissional=inativo.id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('profissional', resp.data)
        self.assertEqual(self.reservar(amanha_as(10), profissional=ativo.id).status_code, 201)

    def test_exige_profissional_quando_a_empresa_tem_profissionais(self):
        criar_profissional(self.emp, 'Única')
        resp = self.reservar(amanha_as(10))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('profissional', resp.data)

    def test_grade_propria_do_profissional_prevalece(self):
        prof = criar_profissional(self.emp, 'Tarde')
        criar_grade_semana(self.emp, profissional=prof, inicio=time(14, 0), fim=time(18, 0))
        self.assertEqual(self.reservar(amanha_as(10), profissional=prof.id).status_code, 400)
        self.assertEqual(self.reservar(amanha_as(14), profissional=prof.id).status_code, 201)

    def test_rejeita_antecedencia_excessiva(self):
        longe = amanha_as(10) + timedelta(days=400)
        resp = self.reservar(longe)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('data_hora', resp.data)

    def test_dono_pode_encaixar_fora_da_grade_pelo_painel(self):
        self.client.force_authenticate(self.emp.owner)
        resp = self.client.post('/api/v1/agendamentos/', {
            'servicos_ids': [self.corte.id], 'nome_cliente': 'Ana', 'whatsapp_cliente': '85988887777',
            'data_hora': amanha_as(19).isoformat(),
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_dono_tambem_nao_agenda_com_profissional_inativo(self):
        inativo = criar_profissional(self.emp, 'Inativa')
        inativo.ativo = False
        inativo.save()
        self.client.force_authenticate(self.emp.owner)
        resp = self.client.post('/api/v1/agendamentos/', {
            'servicos_ids': [self.corte.id], 'nome_cliente': 'Ana', 'whatsapp_cliente': '85988887777',
            'data_hora': amanha_as(10).isoformat(), 'profissional': inativo.id,
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('profissional', resp.data)


class EndpointsPublicosTests(APITestCase):
    def setUp(self):
        self.emp = criar_empresa('studio')
        self.corte = criar_servico(self.emp, 'Corte', 30)
        criar_grade_semana(self.emp, inicio=time(9, 0),
                           fim=time(12, 0), intervalo=30)

    def test_empresa_publica(self):
        resp = self.client.get('/api/v1/public/studio/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['slug'], 'studio')

    def test_lista_servicos_publicos(self):
        resp = self.client.get('/api/v1/public/studio/servicos/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['results'][0]['nome'], 'Corte')

    def test_horarios_disponiveis_marca_ocupado(self):
        Agendamento.objects.create(
            empresa=self.emp, servico=self.corte, nome_cliente='X',
            whatsapp_cliente='85999990000', data_hora=amanha_as(10), duracao_total_min=30,
        )
        data = amanha_as(0).date().isoformat()
        resp = self.client.get(
            f'/api/v1/public/studio/horarios-disponiveis/?data={data}&servicos_ids={self.corte.id}'
        )
        self.assertEqual(resp.status_code, 200)
        slots = {s['hora']: s['disponivel'] for s in resp.data['slots']}
        self.assertEqual(list(slots), ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'])
        self.assertFalse(slots['10:00'])
        self.assertTrue(slots['10:30'])

    def test_horarios_dia_sem_grade(self):
        from agendamentos.models import HorarioFuncionamento
        HorarioFuncionamento.objects.all().delete()
        data = amanha_as(0).date().isoformat()
        resp = self.client.get(f'/api/v1/public/studio/horarios-disponiveis/?data={data}')
        self.assertTrue(resp.data['fechado'])

    def test_horarios_data_invalida(self):
        resp = self.client.get('/api/v1/public/studio/horarios-disponiveis/?data=31-12-2026')
        self.assertEqual(resp.status_code, 400)


class PainelDonoTests(APITestCase):
    def setUp(self):
        self.emp = criar_empresa('painel')
        self.corte = criar_servico(self.emp, 'Corte', 30, '40.00')
        self.client.force_authenticate(self.emp.owner)

    def _ag(self, hora, status='pendente'):
        return Agendamento.objects.create(
            empresa=self.emp, servico=self.corte, nome_cliente='C',
            whatsapp_cliente='85999990000', data_hora=amanha_as(hora),
            duracao_total_min=30, preco_total=Decimal('40.00'), status=status,
        )

    def test_atualiza_status(self):
        ag = self._ag(9)
        resp = self.client.patch(f'/api/v1/agendamentos/{ag.id}/status/', {'status': 'confirmado'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'confirmado')

    def test_status_invalido(self):
        ag = self._ag(9)
        resp = self.client.patch(f'/api/v1/agendamentos/{ag.id}/status/', {'status': 'arquivado'})
        self.assertEqual(resp.status_code, 400)

    def test_filtro_por_status(self):
        self._ag(9, 'confirmado')
        self._ag(11, 'pendente')
        resp = self.client.get('/api/v1/agendamentos/?status=confirmado')
        self.assertEqual(resp.data['count'], 1)

    def test_financeiro_soma_apenas_confirmados(self):
        self._ag(9, 'confirmado')
        self._ag(10, 'confirmado')
        self._ag(11, 'cancelado')
        mes = amanha_as(9).strftime('%Y-%m')
        resp = self.client.get(f'/api/v1/financeiro/resumo/?mes={mes}')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['receita_bruta'], '80.00')
        self.assertEqual(resp.data['agendamentos_cancelados'], 1)

    def test_volume(self):
        self._ag(9)
        resp = self.client.get('/api/v1/agendamentos/volume/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(sum(d['total'] for d in resp.data['por_dia_semana']), 1)

    def test_crud_servico(self):
        resp = self.client.post('/api/v1/servicos/', {'nome': 'Barba', 'duracao_min': 20, 'preco': '25.00'})
        self.assertEqual(resp.status_code, 201)
        sid = resp.data['id']
        self.assertEqual(self.client.patch(f'/api/v1/servicos/{sid}/', {'preco': '30.00'}).status_code, 200)
        self.assertEqual(self.client.delete(f'/api/v1/servicos/{sid}/').status_code, 204)


class CorDestaqueTests(APITestCase):
    def setUp(self):
        self.emp = criar_empresa('cores')
        self.client.force_authenticate(self.emp.owner)
        self.url = f'/api/v1/empresa/{self.emp.id}/'

    def test_padrao_e_exposto_na_pagina_publica(self):
        self.client.force_authenticate(None)
        resp = self.client.get('/api/v1/public/cores/pagina/')
        self.assertEqual(resp.data['empresa']['cor_destaque'], '#165C50')

    def test_aceita_cor_escura_e_clara(self):
        for cor in ['#7a2238', '#FFD25E']:
            resp = self.client.patch(self.url, {'cor_destaque': cor})
            self.assertEqual(resp.status_code, 200, (cor, resp.data))
        self.emp.refresh_from_db()
        self.assertEqual(self.emp.cor_destaque, '#FFD25E')

    def test_rejeita_formato_invalido_e_contraste_ruim(self):
        for cor in ['vermelho', '#FFF', 'javascript:alert(1)', '#12345G', '#808080']:
            resp = self.client.patch(self.url, {'cor_destaque': cor})
            self.assertEqual(resp.status_code, 400, cor)
