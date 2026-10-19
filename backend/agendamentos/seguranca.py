"""
Segurança e observabilidade transversais da API:
- LimitePorEscopo: rate limiting por IP (anônimo) ou usuário (logado), com limites lidos
  de settings.LIMITES_REQUISICAO a cada requisição (ajustável por ambiente e nos testes).
- tratar_excecao: erros inesperados viram JSON amigável com o código da requisição.
- MiddlewareRequisicao: X-Request-ID, log de acesso estruturado e CSP restritiva na API.
- Logs em JSON: ver logs.py (sem dependências, carregado antes dos apps).
"""
import logging
import re
import time
import uuid

from django.conf import settings
from rest_framework.throttling import ScopedRateThrottle

from .logs import FiltroRequestId, FormatadorJson, _request_id  # noqa: F401 (reexporta)

log_acesso = logging.getLogger('agendamentos.acesso')
log_erros = logging.getLogger('agendamentos.erros')

_ID_VALIDO = re.compile(r'^[0-9a-f]{12,32}$')


# ── Rate limiting ─────────────────────────────────────────────────────────────

class LimitePorEscopo(ScopedRateThrottle):
    """
    Usa o `throttle_scope` da view; sem ele, 'painel' para usuários logados e
    'publico' para anônimos. Escopo sem limite configurado = sem limite.
    """

    def allow_request(self, request, view):
        if getattr(view, 'sem_limite_de_requisicao', False):
            return True
        self.scope = getattr(view, self.scope_attr, None) or (
            'painel' if request.user and request.user.is_authenticated else 'publico'
        )
        self.rate = self.get_rate()
        if self.rate is None:
            return True
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super(ScopedRateThrottle, self).allow_request(request, view)

    def get_rate(self):
        return getattr(settings, 'LIMITES_REQUISICAO', {}).get(self.scope)


# ── Erros ─────────────────────────────────────────────────────────────────────

def tratar_excecao(exc, context):
    """Mantém as respostas do DRF (validação, 404, 429…) e trata o que escapou como 500 amigável."""
    # Import tardio: rest_framework.views resolve DEFAULT_THROTTLE_CLASSES (este módulo) ao carregar
    from rest_framework.views import exception_handler

    resposta = exception_handler(exc, context)
    if resposta is not None:
        return resposta
    from rest_framework.response import Response

    codigo = _request_id.get()
    request = context.get('request')
    log_erros.error(
        'Erro inesperado em %s %s', getattr(request, 'method', '?'), getattr(request, 'path', '?'),
        exc_info=exc,
    )
    return Response(
        {'erro': 'Tivemos um problema ao processar seu pedido. Tente de novo em instantes.', 'codigo': codigo},
        status=500,
    )


# ── Middleware de requisição ─────────────────────────────────────────────────

def ip_do_cliente(request) -> str:
    """IP real atrás do proxy do Render (mesma regra do rate limiting: NUM_PROXIES)."""
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    proxies = settings.REST_FRAMEWORK.get('NUM_PROXIES')
    if xff and proxies:
        partes = [p.strip() for p in xff.split(',')]
        return partes[-min(proxies, len(partes))]
    return request.META.get('REMOTE_ADDR', '')


class MiddlewareRequisicao:
    CSP_API = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        recebido = request.META.get('HTTP_X_REQUEST_ID', '').lower()
        rid = recebido if _ID_VALIDO.match(recebido) else uuid.uuid4().hex[:16]
        token = _request_id.set(rid)
        request.request_id = rid
        inicio = time.perf_counter()
        try:
            resposta = self.get_response(request)
        finally:
            _request_id.reset(token)
        resposta['X-Request-ID'] = rid
        if request.path.startswith('/api/'):
            resposta.setdefault('Content-Security-Policy', self.CSP_API)
        if request.path != '/api/v1/health/':
            usuario = getattr(request, 'user', None)
            log_acesso.info(
                '%s %s %s', request.method, request.path, resposta.status_code,
                extra={
                    'request_id': rid,
                    'metodo': request.method,
                    'caminho': request.path,
                    'status': resposta.status_code,
                    'duracao_ms': round((time.perf_counter() - inicio) * 1000, 1),
                    'ip': ip_do_cliente(request),
                    'usuario_id': usuario.pk if usuario is not None and usuario.is_authenticated else None,
                },
            )
        return resposta
