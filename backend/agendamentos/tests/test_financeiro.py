"""Financeiro por serviço: o preço de cada item fica gravado em AgendamentoServico."""
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from agendamentos.models import Agendamento, AgendamentoServico

from .factories import amanha_as, criar_empresa, criar_grade_semana, criar_servico


class FinanceiroPorServicoTests(APITestCase):
    def setUp(self):
        self.emp = criar_empresa('barbearia')
        self.corte = criar_servico(self.emp, 'Corte', 30, '35.00')
        self.barba = criar_servico(self.emp, 'Barba', 20, '25.00')
        criar_grade_semana(self.emp)
        self.client.force_authenticate(self.emp.owner)
        self.mes = amanha_as(9).strftime('%Y-%m')

    def _reservar(self, servicos, hora):
        resp = self.client.post('/api/v1/public/barbearia/agendamentos/', {
            'servicos_ids': [s.id for s in servicos], 'nome_cliente': 'Maria',
            'whatsapp_cliente': '(85) 98888-7777', 'data_hora': amanha_as(hora).isoformat(),
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        ag = Agendamento.objects.get(data_hora=amanha_as(hora))
        ag.status = 'confirmado'
        ag.save(update_fields=['status'])
        return ag

    def _por_servico(self):
        resp = self.client.get(f'/api/v1/financeiro/resumo/?mes={self.mes}')
        self.assertEqual(resp.status_code, 200)
        return {i['servico']: (i['total'], i['receita']) for i in resp.data['por_servico']}, resp.data

    def test_reserva_grava_preco_de_cada_item(self):
        ag = self._reservar([self.corte, self.barba], 10)
        precos = list(ag.agendamento_servicos.values_list('servico__nome', 'preco'))
        self.assertEqual(precos, [('Corte', Decimal('35.00')), ('Barba', Decimal('25.00'))])

    def test_multi_servico_divide_receita_entre_os_itens(self):
        self._reservar([self.corte, self.barba], 10)
        self._reservar([self.barba], 12)
        por_servico, dados = self._por_servico()
        self.assertEqual(por_servico, {'Corte': (1, '35.00'), 'Barba': (2, '50.00')})
        self.assertEqual(dados['receita_bruta'], '85.00')
        # Ordenado pela receita
        self.assertEqual([i['servico'] for i in dados['por_servico']], ['Barba', 'Corte'])

    def test_mudar_preco_do_servico_nao_altera_o_historico(self):
        ag = self._reservar([self.corte, self.barba], 10)
        self.corte.preco = Decimal('50.00')
        self.corte.save()
        por_servico, _ = self._por_servico()
        self.assertEqual(por_servico['Corte'], (1, '35.00'))
        detalhe = self.client.get(f'/api/v1/agendamentos/{ag.id}/').data
        self.assertEqual([s['preco'] for s in detalhe['servicos_info']], ['35.00', '25.00'])

    def test_editar_servicos_regrava_precos_e_total(self):
        ag = self._reservar([self.corte], 10)
        resp = self.client.patch(
            f'/api/v1/agendamentos/{ag.id}/', {'servicos_ids': [self.barba.id]}, format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        ag.refresh_from_db()
        self.assertEqual(ag.preco_total, Decimal('25.00'))
        self.assertEqual(list(ag.agendamento_servicos.values_list('preco', flat=True)), [Decimal('25.00')])


class MigracaoPrecoPorItemTests(TransactionTestCase):
    """A migração 0011 preenche o preço dos itens sem mudar a receita já registrada."""
    antes = [('agendamentos', '0010_empresa_aceite_termos')]
    depois = [('agendamentos', '0011_agendamentoservico_preco')]

    def tearDown(self):
        MigrationExecutor(connection).migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())

    def test_preserva_totais_e_cria_item_para_agendamento_legado(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.antes)
        apps = executor.loader.project_state(self.antes).apps
        User = apps.get_model('auth', 'User')
        Empresa = apps.get_model('agendamentos', 'Empresa')
        Servico = apps.get_model('agendamentos', 'Servico')
        Ag = apps.get_model('agendamentos', 'Agendamento')
        Item = apps.get_model('agendamentos', 'AgendamentoServico')

        emp = Empresa.objects.create(
            owner=User.objects.create(username='dono'), nome_fantasia='E', slug='e',
            whatsapp_contato='85999990000',
        )
        corte = Servico.objects.create(empresa=emp, nome='Corte', duracao_min=30, preco=Decimal('40.00'))
        barba = Servico.objects.create(empresa=emp, nome='Barba', duracao_min=20, preco=Decimal('20.00'))
        quando = timezone.make_aware(datetime.combine(timezone.localdate() + timedelta(days=1), time(9)))

        def ag(preco_total, servico):
            return Ag.objects.create(
                empresa=emp, servico=servico, nome_cliente='C', whatsapp_cliente='85999990000',
                data_hora=quando, status='confirmado', duracao_total_min=50, preco_total=Decimal(preco_total),
            )

        # Reservado quando Corte custava 35 e Barba 25 (total 60); hoje custam 40 e 20
        multi = ag('60.00', corte)
        Item.objects.create(agendamento=multi, servico=corte, ordem=0)
        Item.objects.create(agendamento=multi, servico=barba, ordem=1)
        # Total que não divide exatamente: 3 itens somando 10,00
        terco = ag('10.00', corte)
        tres = Servico.objects.create(empresa=emp, nome='Sobrancelha', duracao_min=10, preco=Decimal('20.00'))
        for o, s in enumerate([corte, barba, tres]):
            Item.objects.create(agendamento=terco, servico=s, ordem=o)
        # Legado: só a FK `servico`, sem itens
        legado = ag('30.00', corte)

        executor = MigrationExecutor(connection)
        executor.migrate(self.depois)
        apps = executor.loader.project_state(self.depois).apps
        Item = apps.get_model('agendamentos', 'AgendamentoServico')

        def precos(a):
            return list(Item.objects.filter(agendamento_id=a.id).order_by('ordem').values_list('preco', flat=True))

        itens_multi = precos(multi)
        self.assertEqual(sum(itens_multi), Decimal('60.00'))
        self.assertEqual(itens_multi, [Decimal('40.00'), Decimal('20.00')])  # proporcional ao preço atual
        self.assertEqual(sum(precos(terco)), Decimal('10.00'))
        self.assertEqual(precos(legado), [Decimal('30.00')])
