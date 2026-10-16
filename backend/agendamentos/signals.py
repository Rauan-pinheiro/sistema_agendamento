"""Invalida o cache da página pública quando o dono altera dados exibidos nela."""
from django.core.cache import cache
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import Empresa, Profissional, Servico
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
