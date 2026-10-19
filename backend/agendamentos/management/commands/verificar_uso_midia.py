"""
Management command: verificar_uso_midia
Uso: python manage.py verificar_uso_midia

Consulta o uso do mês no provedor de mídia (Cloudinary Free: 25 créditos/mês) e
avisa quando passa de MIDIA_ALERTA_CREDITOS (padrão 15). Acima do limite o comando
termina com erro: rodando como Render Cron Job diário, a falha dispara a notificação
por e-mail do Render — é o alerta de "uso passou de ~15 dos 25 créditos".
"""
import logging

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from agendamentos import midia

log = logging.getLogger('agendamentos.midia')

MB = 1024 * 1024


class Command(BaseCommand):
    help = 'Mostra o uso de créditos do armazenamento de mídia e alerta acima do limite.'

    def handle(self, *args, **opts):
        if not midia.configurado():
            raise CommandError('Armazenamento de mídia não configurado.')
        uso = midia.uso_atual()
        alerta = settings.MIDIA_ALERTA_CREDITOS
        limite = f' de {uso.creditos_limite:g}' if uso.creditos_limite else ''
        resumo = (
            f'Créditos usados: {uso.creditos_usados:.2f}{limite} '
            f'(armazenamento {uso.armazenamento_bytes / MB:.0f} MB, banda {uso.banda_bytes / MB:.0f} MB)'
        )
        if uso.creditos_usados >= alerta:
            log.warning('ALERTA de uso de mídia: %s — acima de %s créditos', resumo, alerta)
            raise CommandError(
                f'{resumo}. Passou do alerta de {alerta} créditos: revise limites de upload, '
                'rode limpar_midia_orfa ou planeje a migração para o Cloudflare R2.'
            )
        self.stdout.write(self.style.SUCCESS(f'{resumo}. Abaixo do alerta de {alerta} créditos.'))
