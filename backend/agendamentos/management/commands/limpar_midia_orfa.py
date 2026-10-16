"""
Management command: limpar_midia_orfa
Uso: python manage.py limpar_midia_orfa [--horas 24] [--dry-run]

Remove do Cloudinary arquivos enviados mas nunca confirmados (o navegador fez o
upload direto e a confirmação não chegou: aba fechada, queda de rede etc.).
Considera órfão o arquivo da pasta MIDIA_PASTA_RAIZ que não tem AnexoAgendamento
correspondente e foi criado há mais de N horas. Rode diariamente (Render Cron Job).
"""
from datetime import datetime, timedelta, timezone as dt_tz

import cloudinary.api
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from agendamentos import midia
from agendamentos.models import AnexoAgendamento


class Command(BaseCommand):
    help = 'Apaga do Cloudinary uploads não confirmados há mais de N horas.'

    def add_arguments(self, parser):
        parser.add_argument('--horas', type=int, default=24)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        if not midia.configurado():
            raise CommandError('CLOUDINARY_URL não configurada.')
        limite = datetime.now(dt_tz.utc) - timedelta(hours=opts['horas'])
        conhecidos = set(AnexoAgendamento.objects.values_list('public_id', flat=True))
        apagados = 0

        # 'raw' cobre uploads feitos para o endpoint errado com uma assinatura válida
        varreduras = [*midia.RESOURCE_TYPE.items(), ('raw', 'raw')]
        for tipo, resource_type in varreduras:
            cursor = None
            while True:
                pagina = cloudinary.api.resources(
                    type=midia.TIPO_ENTREGA, resource_type=resource_type,
                    prefix=settings.MIDIA_PASTA_RAIZ + '/', max_results=500, next_cursor=cursor,
                )
                for r in pagina.get('resources', []):
                    criado = datetime.fromisoformat(r['created_at'].replace('Z', '+00:00'))
                    if r['public_id'] in conhecidos or criado > limite:
                        continue
                    apagados += 1
                    self.stdout.write(f'{"[dry-run] " if opts["dry_run"] else ""}órfão: {r["public_id"]}')
                    if not opts['dry_run']:
                        midia.apagar(r['public_id'], tipo, resource_type=resource_type)
                cursor = pagina.get('next_cursor')
                if not cursor:
                    break

        self.stdout.write(self.style.SUCCESS(f'{apagados} arquivo(s) órfão(s) {"encontrados" if opts["dry_run"] else "removidos"}.'))
