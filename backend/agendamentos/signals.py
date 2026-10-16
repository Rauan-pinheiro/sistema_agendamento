"""
Invalida o cache da página pública quando o dono altera dados exibidos nela e
remove do Cloudinary os arquivos de anexos excluídos.
"""
from django.core.cache import cache
from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from . import midia
from .models import AnexoAgendamento, Empresa, Profissional, Servico
from .service import chave_cache_pagina_publica


@receiver(pre_save, sender=Empresa)
def _guardar_slug_original(sender, instance, **kwargs):
    if instance.pk:
        instance._slug_original = (
            Empresa.objects.filter(pk=instance.pk).values_list('slug', flat=True).first()
        )


@receiver([post_save, post_delete], sender=Empresa)
def _invalidar_empresa(sender, instance, **kwargs):
    cache.delete(chave_cache_pagina_publica(instance.slug))
    # Slug pode ter mudado — remove também a chave antiga
    antigo = getattr(instance, '_slug_original', None)
    if antigo and antigo != instance.slug:
        cache.delete(chave_cache_pagina_publica(antigo))


@receiver([post_save, post_delete], sender=Servico)
@receiver([post_save, post_delete], sender=Profissional)
def _invalidar_itens(sender, instance, **kwargs):
    slug = Empresa.objects.filter(pk=instance.empresa_id).values_list('slug', flat=True).first()
    if slug:
        cache.delete(chave_cache_pagina_publica(slug))


@receiver(post_delete, sender=AnexoAgendamento)
def _apagar_arquivo_do_anexo(sender, instance, **kwargs):
    """Remove o arquivo do Cloudinary só depois que a exclusão no banco for confirmada
    (inclui exclusões em cascata, como apagar o agendamento inteiro)."""
    public_id, tipo = instance.public_id, instance.tipo
    transaction.on_commit(lambda: midia.apagar(public_id, tipo))
