from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    EmpresaViewSet,
    ProfissionalViewSet,
    ServicoViewSet,
    AgendamentoViewSet,
    HorarioFuncionamentoViewSet,
    FinanceiroResumoView,
    EmpresaPublicaView,
    ProfissionalPublicoViewSet,
    ServicoPublicoViewSet,
    AgendamentoPublicoViewSet,
    HorariosDisponiveisView,
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

    # ── Rotas públicas (área do cliente, acessada via slug) ───────────────────
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
