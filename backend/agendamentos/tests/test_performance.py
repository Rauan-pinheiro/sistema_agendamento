"""Testes das otimizações da Fase 1 (performance e concorrência)."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import serializers
from rest_framework.test import APITestCase

from agendamentos.models import Agendamento, AgendamentoServico
from agendamentos.serializers import AgendamentoSerializer

from .factories import (
    SENHA, amanha_as, criar_empresa, criar_grade_semana, criar_profissional, criar_servico,
)


def _ag(empresa, servicos, quando, status='pendente'):
    ag = Agendamento.objects.create(
        empresa=empresa, servico=servicos[0], nome_cliente='C', whatsapp_cliente='85999990000',
        data_hora=quando, status=status,
        duracao_total_min=sum(s.duracao_min for s in servicos),
        preco_total=sum(s.preco for s in servicos),
    )
    for i, s in enumerate(servicos):
        AgendamentoServico.objects.create(agendamento=ag, servico=s, ordem=i, preco=s.preco)
    return ag


class PaginaPublicaTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.emp = criar_empresa('vitrine')
        self.corte = criar_servico(self.emp, 'Corte')
        criar_profissional(self.emp, 'Ana')
        self.url = '/api/v1/public/vitrine/pagina/'

    def test_retorna_empresa_servicos_e_profissionais(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['empresa']['slug'], 'vitrine')
        self.assertEqual([s['nome'] for s in resp.data['servicos']], ['Corte'])
        self.assertNotIn('empresa', resp.data['servicos'][0])
        self.assertEqual([p['nome'] for p in resp.data['profissionais']], ['Ana'])

    def test_segunda_chamada_vem_do_cache(self):
        self.client.get(self.url)
        with self.assertNumQueries(0):
            self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_cache_invalidado_ao_alterar_servico(self):
        self.client.get(self.url)
        criar_servico(self.emp, 'Barba')
        nomes = [s['nome'] for s in self.client.get(self.url).data['servicos']]
        self.assertEqual(nomes, ['Barba', 'Corte'])

    def test_cache_invalidado_ao_mudar_slug(self):
        self.client.get(self.url)
        self.emp.slug = 'vitrine-nova'
        self.emp.save()
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_slug_inexistente(self):
        self.assertEqual(self.client.get('/api/v1/public/nada/pagina/').status_code, 404)


class PainelOtimizadoTests(APITestCase):
    def setUp(self):
        self.emp = criar_empresa('painel')
        self.s1 = criar_servico(self.emp, 'Corte', 30, '40.00')
        self.s2 = criar_servico(self.emp, 'Barba', 20, '25.00')
        self.client.force_authenticate(self.emp.owner)

    def test_listagem_tem_numero_constante_de_queries(self):
        for h in range(8, 18):
            _ag(self.emp, [self.s2, self.s1], amanha_as(h))
        # empresa + count + página + 2 de prefetch (vínculos e serviços) — independe do nº de itens
        with self.assertNumQueries(5):
            resp = self.client.get('/api/v1/agendamentos/')
        self.assertEqual(resp.data['count'], 10)
        # Ordem de seleção do cliente preservada
        self.assertEqual([s['nome'] for s in resp.data['results'][0]['servicos_info']], ['Barba', 'Corte'])

    def test_filtro_por_periodo_e_ordem(self):
        hoje = timezone.localdate()
        _ag(self.emp, [self.s1], amanha_as(9) - timedelta(days=10))
        a = _ag(self.emp, [self.s1], amanha_as(9))
        b = _ag(self.emp, [self.s1], amanha_as(9) + timedelta(days=2))
        resp = self.client.get(f'/api/v1/agendamentos/?data_inicio={hoje.isoformat()}&ordem=desc')
        self.assertEqual([r['id'] for r in resp.data['results']], [b.id, a.id])
        amanha = (hoje + timedelta(days=1)).isoformat()
        resp = self.client.get(f'/api/v1/agendamentos/?data_inicio={amanha}&data_fim={amanha}')
        self.assertEqual([r['id'] for r in resp.data['results']], [a.id])

    def test_resumo(self):
        _ag(self.emp, [self.s1], amanha_as(9))
        _ag(self.emp, [self.s1], amanha_as(9) - timedelta(days=30))  # pendente antigo: não conta
        resp = self.client.get('/api/v1/agendamentos/resumo/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['pendentes'], 1)
        self.assertIsNotNone(resp.data['ultimo_criado_em'])
        self.assertGreaterEqual(resp.data['hoje'], 0)

    def test_volume_usa_fuso_local(self):
        # 23h de domingo no horário local é segunda em UTC — deve contar como domingo/23h
        base = amanha_as(23)
        domingo = base + timedelta(days=(6 - base.weekday()))
        _ag(self.emp, [self.s1], domingo)
        resp = self.client.get('/api/v1/agendamentos/volume/')
        dias = {d['dia']: d['total'] for d in resp.data['por_dia_semana']}
        self.assertEqual(dias['Dom'], 1)
        self.assertEqual(resp.data['por_hora'], [{'hora': 23, 'total': 1}])

    def test_financeiro_contadores(self):
        _ag(self.emp, [self.s1, self.s2], amanha_as(9), 'confirmado')
        _ag(self.emp, [self.s1], amanha_as(11), 'pendente')
        _ag(self.emp, [self.s1], amanha_as(12), 'cancelado')
        mes = amanha_as(9).strftime('%Y-%m')
        d = self.client.get(f'/api/v1/financeiro/resumo/?mes={mes}').data
        self.assertEqual(
            (d['total_agendamentos'], d['agendamentos_confirmados'],
             d['agendamentos_pendentes'], d['agendamentos_cancelados']),
            (3, 1, 1, 1),
        )
        self.assertEqual(d['receita_bruta'], '65.00')
        self.assertEqual(d['taxa_confirmacao'], 33.3)


class ConcorrenciaTests(APITestCase):
    def test_create_revalida_conflito_dentro_da_transacao(self):
        """Simula a corrida: outra requisição grava o horário entre o validate() e o save()."""
        emp = criar_empresa('corrida')
        corte = criar_servico(emp, 'Corte', 30)
        criar_grade_semana(emp)
        quando = amanha_as(10)
        ser = AgendamentoSerializer(
            data={'servicos_ids': [corte.id], 'nome_cliente': 'Primeiro',
                  'whatsapp_cliente': '85999990000', 'data_hora': quando.isoformat()},
            context={'empresa': emp},
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        _ag(emp, [corte], quando)  # a "outra" requisição venceu a corrida
        with self.assertRaises(serializers.ValidationError):
            ser.save(empresa=emp)
        self.assertEqual(Agendamento.objects.count(), 1)


class InfraTests(APITestCase):
    def test_health(self):
        resp = self.client.get('/api/v1/health/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'status': 'ok'})

    @override_settings(PASSWORD_HASHERS=[
        'agendamentos.hashers.Argon2OwaspPasswordHasher',
        'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    ])
    def test_senha_pbkdf2_antiga_continua_valida_e_e_migrada(self):
        emp = criar_empresa('legado')
        user = emp.owner
        user.password = make_password(SENHA, hasher='pbkdf2_sha256')
        user.save()
        resp = self.client.post('/api/v1/auth/token/', {'username': user.username, 'password': SENHA})
        self.assertEqual(resp.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.password.startswith('argon2'))

    def test_resposta_grande_e_comprimida(self):
        emp = criar_empresa('gzip')
        for i in range(30):
            criar_servico(emp, f'Serviço {i:02d}', preco=str(Decimal('10.00') + i))
        resp = self.client.get('/api/v1/public/gzip/pagina/', HTTP_ACCEPT_ENCODING='gzip')
        self.assertEqual(resp.get('Content-Encoding'), 'gzip')
