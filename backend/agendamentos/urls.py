from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    EmpresaViewSet,
    ProfissionalViewSet,
    ServicoViewSet,
    AgendamentoViewSet,
    HorarioFuncionamentoViewSet,
    FinanceiroResumoView,
    PerfilUsuarioView,
    EmpresaPublicaView,
    ProfissionalPublicoViewSet,
    ServicoPublicoViewSet,
    AgendamentoPublicoViewSet,
    HorariosDisponiveisView,
    PaginaPublicaView,
    HealthCheckView,
    ContaView,
    ExportarDadosView,
    AnonimizarClienteView,
)

# ── Rotas privadas (dashboard do prestador) ───────────────────────────────────
router = DefaultRouter()
router.register(r'empresa',        EmpresaViewSet,               basename='empresa')
router.register(r'profissionais',  ProfissionalViewSet,          basename='profissional')
router.register(r'servicos',       ServicoViewSet,               basename='servico')
router.register(r'agendamentos',   AgendamentoViewSet,           basename='agendamento')
router.register(r'horarios',       HorarioFuncionamentoViewSet,  basename='horario')

urlpatterns = [
    path('', include(router.urls)),

    # Financeiro (autenticado)
    path('financeiro/resumo/', FinanceiroResumoView.as_view(), name='financeiro-resumo'),

    # Perfil do usuário logado (autenticado)
    path('usuario/', PerfilUsuarioView.as_view(), name='usuario-perfil'),

    path('health/', HealthCheckView.as_view(), name='health'),
    # LGPD
    path('conta/', ContaView.as_view(), name='conta'),
    path('conta/exportar/', ExportarDadosView.as_view(), name='conta-exportar'),
    path('clientes/anonimizar/', AnonimizarClienteView.as_view(), name='clientes-anonimizar'),

    # ── Rotas públicas (área do cliente, acessada via slug) ───────────────────
    path('public/<slug:slug>/pagina/',
         PaginaPublicaView.as_view(),
         name='public-pagina'),
    path('public/<slug:slug>/',
         EmpresaPublicaView.as_view(),
         name='public-empresa'),
    path('public/<slug:slug>/profissionais/',
         ProfissionalPublicoViewSet.as_view({'get': 'list'}),
         name='public-profissionais'),
    path('public/<slug:slug>/servicos/',
         ServicoPublicoViewSet.as_view({'get': 'list'}),
         name='public-servicos'),
    path('public/<slug:slug>/agendamentos/',
         AgendamentoPublicoViewSet.as_view({'post': 'create'}),
         name='public-agendamentos'),
    path('public/<slug:slug>/horarios-disponiveis/',
         HorariosDisponiveisView.as_view(),
         name='public-horarios-disponiveis'),
]
