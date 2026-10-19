"""Rate limiting, headers de segurança, tratamento global de erros e logs estruturados."""
import json
import logging
from unittest import mock

from django.conf import settings
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from agendamentos.seguranca import FormatadorJson

from .factories import SENHA, amanha_as, criar_empresa, criar_grade_semana, criar_servico

LIMITES_BAIXOS = {'login': '3/min', 'reserva_publica': '2/hour', 'publico': '5/min', 'painel': '1000/min'}


@override_settings(LIMITES_REQUISICAO=LIMITES_BAIXOS)
class RateLimitTests(APITestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_login_bloqueia_forca_bruta(self):
        emp = criar_empresa()
        codigos = [
            self.client.post('/api/v1/auth/token/', {'username': emp.owner.username, 'password': 'x'}).status_code
            for _ in range(4)
        ]
        self.assertEqual(codigos, [401, 401, 401, 429])
        # Mesmo com a senha certa, segue bloqueado até a janela passar
        ok = self.client.post('/api/v1/auth/token/', {'username': emp.owner.username, 'password': SENHA})
        self.assertEqual(ok.status_code, 429)
        self.assertIn('Retry-After', ok)

    def test_reservas_publicas_limitadas_por_ip(self):
        emp = criar_empresa('limite')
        criar_grade_semana(emp)
        serv = criar_servico(emp)
        codigos = []
        for hora in (9, 10, 11):
            codigos.append(self.client.post('/api/v1/public/limite/agendamentos/', {
                'servicos_ids': [serv.id], 'nome_cliente': 'Ana', 'whatsapp_cliente': '85988887777',
                'data_hora': amanha_as(hora).isoformat(),
            }, format='json').status_code)
        self.assertEqual(codigos, [201, 201, 429])

    def test_leituras_publicas_limitadas(self):
        criar_empresa('leitura')
        codigos = [self.client.get('/api/v1/public/leitura/pagina/').status_code for _ in range(6)]
        self.assertEqual(codigos[-1], 429)

    def test_health_check_nunca_e_limitado(self):
        codigos = {self.client.get('/api/v1/health/').status_code for _ in range(10)}
        self.assertEqual(codigos, {200})


class HeadersTests(APITestCase):
    def test_api_responde_com_headers_de_seguranca(self):
        resp = self.client.get('/api/v1/health/')
        self.assertEqual(resp['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(resp['X-Frame-Options'], 'DENY')
        self.assertIn("default-src 'none'", resp['Content-Security-Policy'])
        self.assertIn('Referrer-Policy', resp)
        self.assertRegex(resp['X-Request-ID'], r'^[0-9a-f]{12,32}$')

    def test_reaproveita_request_id_valido_do_proxy(self):
        resp = self.client.get('/api/v1/health/', HTTP_X_REQUEST_ID='abc123def4567890')
        self.assertEqual(resp['X-Request-ID'], 'abc123def4567890')

    def test_ignora_request_id_malicioso(self):
        resp = self.client.get('/api/v1/health/', HTTP_X_REQUEST_ID='x\n<script>')
        self.assertRegex(resp['X-Request-ID'], r'^[0-9a-f]{12,32}$')


class ErroGlobalTests(APITestCase):
    def test_erro_inesperado_vira_json_amigavel_com_codigo(self):
        emp = criar_empresa()
        self.client.force_authenticate(emp.owner)
        self.client.raise_request_exception = False
        with mock.patch('agendamentos.views.calcular_resumo_financeiro', side_effect=RuntimeError('boom')), \
                self.assertLogs('agendamentos.erros', level='ERROR') as logs:
            resp = self.client.get('/api/v1/financeiro/resumo/')
        self.assertEqual(resp.status_code, 500)
        corpo = resp.json()
        self.assertIn('erro', corpo)
        self.assertNotIn('boom', corpo['erro'])  # não vaza detalhes internos
        self.assertEqual(corpo['codigo'], resp['X-Request-ID'])
        self.assertTrue(any('boom' in linha for linha in logs.output))


class LogEstruturadoTests(APITestCase):
    def test_formatador_gera_json_com_request_id(self):
        registro = logging.LogRecord('x', logging.INFO, __file__, 1, 'olá %s', ('mundo',), None)
        registro.request_id = 'abc'
        registro.status = 200
        dados = json.loads(FormatadorJson().format(registro))
        self.assertEqual(dados['msg'], 'olá mundo')
        self.assertEqual(dados['request_id'], 'abc')
        self.assertEqual(dados['status'], 200)
        self.assertEqual(dados['nivel'], 'INFO')


@override_settings(LIMITES_REQUISICAO=LIMITES_BAIXOS)
class IpAtrasDoProxyTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_clientes_diferentes_atras_do_proxy_tem_baldes_separados(self):
        from rest_framework.settings import api_settings
        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, 'NUM_PROXIES': 1}):
            self.assertEqual(api_settings.NUM_PROXIES, 1)
            criar_empresa('proxy')
            url = '/api/v1/public/proxy/pagina/'
            for _ in range(5):
                self.client.get(url, HTTP_X_FORWARDED_FOR='200.1.1.1', REMOTE_ADDR='10.0.0.1')
            bloqueado = self.client.get(url, HTTP_X_FORWARDED_FOR='200.1.1.1', REMOTE_ADDR='10.0.0.1')
            outro = self.client.get(url, HTTP_X_FORWARDED_FOR='200.2.2.2', REMOTE_ADDR='10.0.0.1')
        self.assertEqual((bloqueado.status_code, outro.status_code), (429, 200))
