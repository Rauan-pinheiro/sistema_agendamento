"""
Invalida o cache da página pública quando o dono altera dados exibidos nela e
remove do Cloudinary os arquivos de anexos excluídos.
"""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from . import midia
from .models import AnexoAgendamento, Empresa, MidiaServico, Profissional, Servico
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


@receiver(post_save, sender=User)
def _invalidar_dono(sender, instance, update_fields=None, **kwargs):
    # Suspender/reativar a conta (is_active) muda a página pública. O login só grava last_login.
    if update_fields and set(update_fields) <= {'last_login'}:
        return
    slug = Empresa.objects.filter(owner=instance).values_list('slug', flat=True).first()
    if slug:
        cache.delete(chave_cache_pagina_publica(slug))


@receiver([post_save, post_delete], sender=Servico)
@receiver([post_save, post_delete], sender=Profissional)
@receiver([post_save, post_delete], sender=MidiaServico)
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


@receiver(post_delete, sender=Empresa)
@receiver(post_delete, sender=Profissional)
def _apagar_imagens(sender, instance, **kwargs):
    """Capa, logo e foto de profissional são públicas: apaga junto com o dono."""
    ids = [getattr(instance, c, '') for c in ('capa_public_id', 'logo_public_id', 'foto_public_id')]
    for public_id in filter(None, ids):
        transaction.on_commit(lambda p=public_id: midia.apagar(p, 'imagem', entrega=midia.ENTREGA_PUBLICA))


@receiver(post_delete, sender=MidiaServico)
def _apagar_arquivo_da_midia(sender, instance, **kwargs):
    if instance.tipo == 'youtube' or not instance.public_id:
        return
    public_id, tipo = instance.public_id, instance.tipo
    transaction.on_commit(lambda: midia.apagar(public_id, tipo, entrega=midia.ENTREGA_PUBLICA))
