from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    EmpresaViewSet,
    ServicoViewSet,
    AgendamentoViewSet,
    HorarioFuncionamentoViewSet,
    EmpresaPublicaView,
    ServicoPublicoViewSet,
    AgendamentoPublicoViewSet,
    HorariosDisponiveisView,
)

# ── Rotas privadas (dashboard do prestador) ───────────────────────────────────
router = DefaultRouter()
router.register(r'empresa', EmpresaViewSet, basename='empresa')
router.register(r'servicos', ServicoViewSet, basename='servico')
router.register(r'agendamentos', AgendamentoViewSet, basename='agendamento')
router.register(r'horarios', HorarioFuncionamentoViewSet, basename='horario')

# ── Rotas públicas (área do cliente, acessada via slug) ───────────────────────
urlpatterns = [
    path('', include(router.urls)),

    path(
        'public/<slug:slug>/',
        EmpresaPublicaView.as_view(),
        name='public-empresa',
    ),
    path(
        'public/<slug:slug>/servicos/',
        ServicoPublicoViewSet.as_view({'get': 'list'}),
        name='public-servicos',
    ),
    path(
        'public/<slug:slug>/agendamentos/',
        AgendamentoPublicoViewSet.as_view({'post': 'create'}),
        name='public-agendamentos',
    ),
    path(
        'public/<slug:slug>/horarios-disponiveis/',
        HorariosDisponiveisView.as_view(),
        name='public-horarios-disponiveis',
    ),
]
