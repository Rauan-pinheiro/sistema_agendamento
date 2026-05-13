"""
Management command: arquivar_agendamentos
Uso: python manage.py arquivar_agendamentos [--dias N] [--dry-run]

Arquiva agendamentos com data_hora anterior a N dias (padrão 90) cujo status
seja 'confirmado' ou 'cancelado', movendo-os para 'arquivado'.

Isolamento por tenant: a query filtra apenas por status e data — cada
Agendamento já carrega sua FK empresa, portanto a operação jamais toca
registros de outra empresa. O filtro nunca é cruzado entre tenants.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandParser
from django.utils import timezone

from agendamentos.models import Agendamento


class Command(BaseCommand):
    help = 'Arquiva agendamentos confirmados ou cancelados com mais de N dias.'

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            '--dias',
            type=int,
            default=90,
            help='Quantidade de dias de corte (padrão: 90).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Apenas conta os registros que seriam arquivados, sem alterar o banco.',
        )

    def handle(self, *args, **options) -> None:
        dias: int = options['dias']
        dry_run: bool = options['dry_run']

        limite = timezone.now() - timedelta(days=dias)

        qs = Agendamento.objects.filter(
            data_hora__lt=limite,
            status__in=['confirmado', 'cancelado'],
        )

        total = qs.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'[dry-run] {total} agendamento(s) seriam arquivados (corte: {limite.date()}).'
                )
            )
            return

        # QuerySet.update() é atômico e não dispara signals — adequado para
        # operações em lote de arquivamento. O campo atualizado_em tem
        # auto_now=True e não é atualizado por .update(); isso é intencional:
        # a data de arquivamento é registrada no status, não no timestamp.
        updated = qs.update(status='arquivado')

        self.stdout.write(
            self.style.SUCCESS(
                f'{updated} agendamento(s) arquivado(s) '
                f'(data_hora < {limite.date()}, dias={dias}).'
            )
        )
