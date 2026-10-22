"""Rotas da API (/api/v1/) e do admin (caminho configurável em DJANGO_ADMIN_URL)."""
from django.conf import settings
from django.contrib import admin
from django.urls import path, include
from agendamentos.views import LoginView, RefreshView, RegistroView

urlpatterns = [
    # Caminho do admin configurável (DJANGO_ADMIN_URL) para não ficar no endereço óbvio
    path(settings.ADMIN_URL, admin.site.urls),

    # ── Auth JWT ──────────────────────────────────────────────────────────────
    path('api/v1/auth/registro/', RegistroView.as_view(), name='registro'),
    path('api/v1/auth/token/', LoginView.as_view(), name='token_obtain_pair'),
    path('api/v1/auth/token/refresh/', RefreshView.as_view(), name='token_refresh'),

    # ── App ───────────────────────────────────────────────────────────────────
    path('api/v1/', include('agendamentos.urls')),
]

if settings.MIDIA_PROVEDOR == 'local':
    # Fazem o papel do Cloudinary em desenvolvimento e na simulação local (midia_local.py)
    from agendamentos import midia_local

    urlpatterns += [
        path('api/v1/midia-local/upload/', midia_local.receber_upload, name='midia_local_upload'),
        path('api/v1/midia-local/arquivo/<str:entrega>/<path:public_id>',
             midia_local.servir_arquivo, name='midia_local_arquivo'),
    ]
