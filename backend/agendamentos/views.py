from rest_framework import viewsets, permissions, mixins, generics, status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.shortcuts import get_object_or_404

from .models import Empresa, Servico, Agendamento
from .serializers import EmpresaSerializer, EmpresaPublicSerializer, ServicoSerializer, AgendamentoSerializer, RegistroSerializer


# ── Paginação ─────────────────────────────────────────────────────────────────

class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_empresa_do_usuario(user):
    return get_object_or_404(Empresa, owner=user)


# ── Dashboard (autenticado) ───────────────────────────────────────────────────

class EmpresaViewSet(viewsets.ModelViewSet):
    """
    Retorna e permite editar apenas a Empresa do usuário autenticado.
    Criação e exclusão são gerenciadas pelo fluxo de registro, não pela API.
    """
    serializer_class = EmpresaSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'put', 'patch', 'head', 'options']

    def get_queryset(self):
        return Empresa.objects.filter(owner=self.request.user)


class ServicoViewSet(viewsets.ModelViewSet):
    """
    CRUD de Serviços isolado por Tenant.
    Cada usuário vê e manipula apenas os serviços da sua própria Empresa.
    """
    serializer_class = ServicoSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardPagination

    def _empresa(self):
        return get_empresa_do_usuario(self.request.user)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['empresa'] = self._empresa()
        return context

    def get_queryset(self):
        return Servico.objects.filter(empresa=self._empresa())

    def perform_create(self, serializer):
        serializer.save(empresa=self._empresa())


class AgendamentoViewSet(viewsets.ModelViewSet):
    """
    CRUD de Agendamentos isolado por Tenant.
    Suporta filtro por status: GET /agendamentos/?status=pendente
    """
    serializer_class = AgendamentoSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardPagination

    def _empresa(self):
        return get_empresa_do_usuario(self.request.user)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['empresa'] = self._empresa()
        return context

    def get_queryset(self):
        qs = Agendamento.objects.filter(
            empresa=self._empresa()
        ).select_related('servico').order_by('data_hora')

        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)

        return qs

    def perform_create(self, serializer):
        serializer.save(empresa=self._empresa())

    @action(detail=True, methods=['patch'], url_path='status')
    def atualizar_status(self, request, pk=None):
        """PATCH /api/v1/agendamentos/{id}/status/ — body: {"status": "confirmado"|"cancelado"}"""
        agendamento = self.get_object()
        novo_status = request.data.get('status')

        STATUS_PERMITIDOS = ['confirmado', 'cancelado']
        if novo_status not in STATUS_PERMITIDOS:
            return Response(
                {'status': f'Valor inválido. Use: {", ".join(STATUS_PERMITIDOS)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        agendamento.status = novo_status
        agendamento.save(update_fields=['status', 'atualizado_em'])
        return Response(self.get_serializer(agendamento).data)


# ── Área pública (sem autenticação) ──────────────────────────────────────────

class ServicoPublicoViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    Lista os serviços de uma empresa pelo slug — sem autenticação.
    Rota: GET /api/public/<slug>/servicos/
    """
    serializer_class = ServicoSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = StandardPagination

    def get_queryset(self):
        empresa = get_object_or_404(Empresa, slug=self.kwargs['slug'])
        return Servico.objects.filter(empresa=empresa)


class AgendamentoPublicoViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    Permite ao cliente final criar um agendamento para uma empresa pelo slug.
    Rota: POST /api/public/<slug>/agendamentos/
    """
    serializer_class = AgendamentoSerializer
    permission_classes = [permissions.AllowAny]

    def _empresa(self):
        return get_object_or_404(Empresa, slug=self.kwargs['slug'])

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['empresa'] = self._empresa()
        return context

    def perform_create(self, serializer):
        serializer.save(empresa=self._empresa())


# ── Info pública da empresa (sem autenticação) ────────────────────────────────

class EmpresaPublicaView(generics.RetrieveAPIView):
    """
    Retorna dados básicos da empresa pelo slug — sem autenticação.
    Rota: GET /api/v1/public/<slug>/
    """
    serializer_class = EmpresaPublicSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = 'slug'
    queryset = Empresa.objects.all()


# ── Registro de novo prestador ────────────────────────────────────────────────

class RegistroView(generics.CreateAPIView):
    """
    Cria User + Empresa numa única operação atômica e retorna os tokens JWT.
    Rota: POST /api/v1/auth/registro/
    """
    serializer_class = RegistroSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user, empresa = serializer.save()

        refresh = RefreshToken.for_user(user)

        return Response({
            'access':  str(refresh.access_token),
            'refresh': str(refresh),
            'empresa': EmpresaSerializer(empresa).data,
        }, status=status.HTTP_201_CREATED)
