from django.contrib import admin
from .models import Empresa, Servico, Agendamento


@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ('nome_fantasia', 'owner', 'slug', 'whatsapp_contato')
    prepopulated_fields = {'slug': ('nome_fantasia',)}


@admin.register(Servico)
class ServicoAdmin(admin.ModelAdmin):
    list_display = ('nome', 'empresa', 'duracao_min', 'preco', 'criado_em')
    list_filter = ('empresa',)


@admin.register(Agendamento)
class AgendamentoAdmin(admin.ModelAdmin):
    list_display = ('nome_cliente', 'empresa', 'servico', 'data_hora', 'status', 'criado_em')
    list_filter = ('empresa', 'status')
    search_fields = ('nome_cliente', 'whatsapp_cliente')
