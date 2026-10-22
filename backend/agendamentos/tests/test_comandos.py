"""Comandos de manutenção: arquivar_agendamentos e popular_carga."""
from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone

from agendamentos.models import Agendamento, AgendamentoServico, Empresa

from .factories import criar_empresa, criar_servico


def _rodar(*args, **opts) -> str:
    out = StringIO()
    call_command(*args, stdout=out, **opts)
    return out.getvalue()


class ArquivarAgendamentosTests(TestCase):
    def setUp(self):
        self.emp = criar_empresa('a')
        self.outra = criar_empresa('b')
        self.corte = criar_servico(self.emp)

    def _ag(self, dias_atras, status, empresa=None):
        empresa = empresa or self.emp
        return Agendamento.objects.create(
            empresa=empresa, servico=criar_servico(empresa) if empresa != self.emp else self.corte,
            nome_cliente='C', whatsapp_cliente='85999990000', status=status,
            data_hora=timezone.now() - timedelta(days=dias_atras),
        )

    def test_arquiva_so_confirmados_e_cancelados_antigos(self):
        antigos = [self._ag(100, 'confirmado'), self._ag(91, 'cancelado'), self._ag(120, 'confirmado', self.outra)]
        pendente_antigo = self._ag(200, 'pendente')
        recente = self._ag(10, 'confirmado')

        saida = _rodar('arquivar_agendamentos')

        self.assertIn('3 agendamento(s) arquivado(s)', saida)
        for ag in antigos:
            ag.refresh_from_db()
            self.assertEqual(ag.status, 'arquivado')
        pendente_antigo.refresh_from_db()
        recente.refresh_from_db()
        self.assertEqual((pendente_antigo.status, recente.status), ('pendente', 'confirmado'))

    def test_dias_personalizado(self):
        ag = self._ag(10, 'confirmado')
        _rodar('arquivar_agendamentos', dias=5)
        ag.refresh_from_db()
        self.assertEqual(ag.status, 'arquivado')

    def test_dry_run_nao_altera(self):
        ag = self._ag(100, 'confirmado')
        saida = _rodar('arquivar_agendamentos', dry_run=True)
        self.assertIn('[dry-run] 1 agendamento(s)', saida)
        ag.refresh_from_db()
        self.assertEqual(ag.status, 'confirmado')


@override_settings(DEBUG=True)
class PopularCargaTests(TestCase):
    def test_cria_empresas_com_dados_consistentes(self):
        saida = _rodar('popular_carga', empresas=2, historico=30)
        self.assertIn('Pronto.', saida)

        empresas = Empresa.objects.filter(slug__startswith='carga-')
        self.assertEqual(empresas.count(), 2)
        self.assertTrue(User.objects.get(username='dono_carga_1').check_password('Carga-123!'))
        for emp in empresas:
            ags = Agendamento.objects.filter(empresa=emp)
            self.assertEqual(ags.count(), 30)
            self.assertEqual(emp.servico_set.count(), 8)
            self.assertEqual(emp.horariofuncionamento_set.count(), 7)
            # Totais do agendamento batem com a soma dos itens (financeiro por serviço)
            for ag in ags:
                itens = AgendamentoServico.objects.filter(agendamento=ag)
                self.assertGreaterEqual(itens.count(), 1)
                self.assertEqual(sum(i.preco for i in itens), ag.preco_total)
                self.assertTrue(all(i.servico.empresa_id == emp.id for i in itens))

    def test_pode_rodar_de_novo_sem_duplicar_nem_tocar_outras_empresas(self):
        real = criar_empresa('cliente-real')
        _rodar('popular_carga', empresas=2, historico=5)
        _rodar('popular_carga', empresas=1, historico=5)
        self.assertEqual(list(Empresa.objects.filter(slug__startswith='carga-').values_list('slug', flat=True)),
                         ['carga-1'])
        self.assertTrue(Empresa.objects.filter(pk=real.pk).exists())

    @override_settings(DEBUG=False)
    def test_recusa_rodar_sem_debug(self):
        with self.assertRaises(CommandError):
            _rodar('popular_carga', empresas=1, historico=1)
        self.assertFalse(Empresa.objects.filter(slug__startswith='carga-').exists())

    @override_settings(DEBUG=False)
    def test_forcar_permite_rodar_sem_debug(self):
        _rodar('popular_carga', empresas=1, historico=1, forcar=True)
        self.assertEqual(Agendamento.objects.filter(preco_total__gt=Decimal('0')).count(), 1)
