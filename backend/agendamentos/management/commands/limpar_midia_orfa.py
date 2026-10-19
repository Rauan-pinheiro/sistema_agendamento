"""
Management command: limpar_midia_orfa
Uso: python manage.py limpar_midia_orfa [--horas 24] [--dry-run]

Remove do armazenamento de mídia arquivos enviados mas nunca confirmados (o navegador fez o
upload direto e a confirmação não chegou: aba fechada, queda de rede etc.).
Considera órfão o arquivo da pasta MIDIA_PASTA_RAIZ que não tem AnexoAgendamento
nem MidiaServico correspondente e foi criado há mais de N horas. Rode diariamente (Render Cron Job).
"""
from datetime import datetime, timedelta, timezone as dt_tz

from django.core.management.base import BaseCommand, CommandError

from agendamentos import midia
from agendamentos.models import AnexoAgendamento, MidiaServico


class Command(BaseCommand):
    help = 'Apaga do armazenamento uploads não confirmados há mais de N horas.'

    def add_arguments(self, parser):
        parser.add_argument('--horas', type=int, default=24)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        if not midia.configurado():
            raise CommandError('Armazenamento de mídia não configurado.')
        limite = datetime.now(dt_tz.utc) - timedelta(hours=opts['horas'])
        conhecidos = set(AnexoAgendamento.objects.values_list('public_id', flat=True))
        conhecidos |= set(
            MidiaServico.objects.exclude(public_id=None).values_list('public_id', flat=True)
        )
        apagados = 0

        for arq in midia.listar_arquivos():
            if arq.public_id in conhecidos or arq.criado_em > limite:
                continue
            apagados += 1
            self.stdout.write(f'{"[dry-run] " if opts["dry_run"] else ""}órfão: {arq.public_id}')
            if not opts['dry_run']:
                midia.apagar(arq.public_id, arq.tipo, resource_type=arq.resource_type, entrega=arq.entrega)

        self.stdout.write(self.style.SUCCESS(f'{apagados} arquivo(s) órfão(s) {"encontrados" if opts["dry_run"] else "removidos"}.'))
