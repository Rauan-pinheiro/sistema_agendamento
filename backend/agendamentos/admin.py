from django.contrib import admin
from .models import Empresa, Servico, Agendamento


@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ('nome_fantasia', 'owner', 'slug', 'whatsapp_contato', 'ativa', 'termos_versao')
    list_filter = ('owner__is_active',)
    search_fields = ('nome_fantasia', 'slug', 'owner__username', 'owner__email', 'whatsapp_contato')
    prepopulated_fields = {'slug': ('nome_fantasia',)}
    actions = ['suspender', 'reativar']

    @admin.display(boolean=True, description='Ativa', ordering='owner__is_active')
    def ativa(self, obj):
        return obj.owner.is_active

    def _definir_ativo(self, request, queryset, ativo: bool):
        # save() de cada dono (e não update()) para o signal limpar o cache da página pública
        for empresa in queryset.select_related('owner'):
            empresa.owner.is_active = ativo
            empresa.owner.save(update_fields=['is_active'])
        self.message_user(request, f'{queryset.count()} empresa(s) {"reativada(s)" if ativo else "suspensa(s)"}.')

    @admin.action(description='Suspender (bloqueia o painel e tira a página pública do ar)')
    def suspender(self, request, queryset):
        self._definir_ativo(request, queryset, False)

    @admin.action(description='Reativar')
    def reativar(self, request, queryset):
        self._definir_ativo(request, queryset, True)


@admin.register(Servico)
class ServicoAdmin(admin.ModelAdmin):
    list_display = ('nome', 'empresa', 'duracao_min', 'preco', 'criado_em')
    list_filter = ('empresa',)


@admin.register(Agendamento)
class AgendamentoAdmin(admin.ModelAdmin):
    list_display = ('nome_cliente', 'empresa', 'servico', 'data_hora', 'status', 'criado_em')
    list_filter = ('empresa', 'status')
    search_fields = ('nome_cliente', 'whatsapp_cliente')
