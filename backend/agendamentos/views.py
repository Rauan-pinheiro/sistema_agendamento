from datetime import datetime, timedelta, time as time_type
from rest_framework import viewsets, permissions, mixins, generics, status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import Empresa, Profissional, Servico, Agendamento, HorarioFuncionamento
from .serializers import (
    EmpresaSerializer, EmpresaPublicSerializer,
    ProfissionalSerializer, ProfissionalPublicSerializer,
    ServicoSerializer, AgendamentoSerializer,
    HorarioFuncionamentoSerializer, RegistroSerializer,
)
from .service import calcular_resumo_financeiro


# ── Paginação ─────────────────────────────────────────────────────────────────

class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_empresa_do_usuario(user) -> Empresa:
    return get_object_or_404(Empresa, owner=user)


# ── Dashboard (autenticado) ───────────────────────────────────────────────────

class EmpresaViewSet(viewsets.ModelViewSet):
    serializer_class = EmpresaSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'put', 'patch', 'head', 'options']
    pagination_class = None

    def get_queryset(self):
        return Empresa.objects.filter(owner=self.request.user)


class ProfissionalViewSet(viewsets.ModelViewSet):
    """CRUD de Profissionais isolado por Tenant."""
    serializer_class = ProfissionalSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardPagination

    def _empresa(self) -> Empresa:
        return get_empresa_do_usuario(self.request.user)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['empresa'] = self._empresa()
        return ctx

    def get_queryset(self):
        return Profissional.objects.filter(empresa=self._empresa())

    def perform_create(self, serializer):
        serializer.save(empresa=self._empresa())


class ServicoViewSet(viewsets.ModelViewSet):
    serializer_class = ServicoSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardPagination

    def _empresa(self) -> Empresa:
        return get_empresa_do_usuario(self.request.user)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['empresa'] = self._empresa()
        return ctx

    def get_queryset(self):
        return Servico.objects.filter(empresa=self._empresa())

    def perform_create(self, serializer):
        serializer.save(empresa=self._empresa())


class AgendamentoViewSet(viewsets.ModelViewSet):
    """
    CRUD de Agendamentos isolado por Tenant.
    Filtros: ?status=pendente  |  ?profissional_id=N
    """
    serializer_class = AgendamentoSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardPagination

    def _empresa(self) -> Empresa:
        return get_empresa_do_usuario(self.request.user)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['empresa'] = self._empresa()
        return ctx

    def get_queryset(self):
        qs = (
            Agendamento.objects
            .filter(empresa=self._empresa())
            .select_related('servico', 'profissional')
            .order_by('data_hora')
        )
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        profissional_id = self.request.query_params.get('profissional_id')
        if profissional_id:
            qs = qs.filter(profissional_id=profissional_id)

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


class HorarioFuncionamentoViewSet(viewsets.ModelViewSet):
    """
    CRUD dos horários de funcionamento.
    Suporta grade geral (?profissional_id=null) e por profissional (?profissional_id=N).
    """
    serializer_class = HorarioFuncionamentoSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def _empresa(self) -> Empresa:
        return get_empresa_do_usuario(self.request.user)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['empresa'] = self._empresa()
        return ctx

    def get_queryset(self):
        qs = HorarioFuncionamento.objects.filter(empresa=self._empresa())
        profissional_id = self.request.query_params.get('profissional_id')
        if profissional_id == 'null' or profissional_id == '':
            qs = qs.filter(profissional__isnull=True)
        elif profissional_id:
            qs = qs.filter(profissional_id=profissional_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(empresa=self._empresa())


# ── Financeiro (autenticado) ──────────────────────────────────────────────────

class FinanceiroResumoView(APIView):
    """
    GET /api/v1/financeiro/resumo/
    Parâmetro opcional: ?mes=YYYY-MM  (padrão: mês corrente)
    Retorna métricas detalhadas do mês sem nenhum model extra.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        empresa = get_empresa_do_usuario(request.user)

        mes_param = request.query_params.get('mes')
        mes_ref = None
        if mes_param:
            try:
                mes_ref = datetime.strptime(mes_param, '%Y-%m').date()
            except ValueError:
                return Response(
                    {'erro': 'Formato inválido para ?mes. Use YYYY-MM.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        resumo = calcular_resumo_financeiro(empresa, mes_ref)
        return Response(resumo)


# ── Área pública (sem autenticação) ──────────────────────────────────────────

class ProfissionalPublicoViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    Lista profissionais ativos de uma empresa pelo slug.
    GET /api/v1/public/<slug>/profissionais/
    """
    serializer_class = ProfissionalPublicSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        empresa = get_object_or_404(Empresa, slug=self.kwargs['slug'])
        return Profissional.objects.filter(empresa=empresa, ativo=True)


class ServicoPublicoViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ServicoSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = StandardPagination

    def get_queryset(self):
        empresa = get_object_or_404(Empresa, slug=self.kwargs['slug'])
        return Servico.objects.filter(empresa=empresa)


class AgendamentoPublicoViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = AgendamentoSerializer
    permission_classes = [permissions.AllowAny]

    def _empresa(self) -> Empresa:
        return get_object_or_404(Empresa, slug=self.kwargs['slug'])

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['empresa'] = self._empresa()
        return ctx

    def perform_create(self, serializer):
        serializer.save(empresa=self._empresa())


class EmpresaPublicaView(generics.RetrieveAPIView):
    serializer_class = EmpresaPublicSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = 'slug'
    queryset = Empresa.objects.all()


class HorariosDisponiveisView(generics.GenericAPIView):
    """
    GET /api/v1/public/<slug>/horarios-disponiveis/
    Parâmetros: ?data=YYYY-MM-DD  [&servico_id=N]  [&profissional_id=N]

    Prioridade da grade:
    1. Se profissional_id informado E profissional tem grade própria → usa grade do profissional
    2. Caso contrário → usa grade geral da empresa (profissional=None)
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug: str):
        empresa = get_object_or_404(Empresa, slug=slug)

        data_str = request.query_params.get('data')
        if not data_str:
            return Response(
                {'erro': 'Parâmetro ?data=YYYY-MM-DD é obrigatório.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            data = datetime.strptime(data_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'erro': 'Formato de data inválido. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dia_semana = data.weekday()

        # Resolve qual grade de horário usar
        profissional: Profissional | None = None
        profissional_id = request.query_params.get('profissional_id')
        if profissional_id:
            try:
                profissional = Profissional.objects.get(pk=profissional_id, empresa=empresa, ativo=True)
            except Profissional.DoesNotExist:
                pass  # cai para a grade geral

        horario = self._resolver_horario(empresa, dia_semana, profissional)
        if horario is None:
            return Response({'data': data_str, 'slots': [], 'fechado': True})

        # Duração do slot
        duracao_min = horario.intervalo_min
        servico_id = request.query_params.get('servico_id')
        if servico_id:
            try:
                servico = Servico.objects.get(pk=servico_id, empresa=empresa)
                duracao_min = servico.duracao_min
            except Servico.DoesNotExist:
                pass

        local_tz = timezone.get_current_timezone()
        inicio = timezone.make_aware(datetime.combine(data, horario.hora_inicio), local_tz)
        fim = timezone.make_aware(datetime.combine(data, horario.hora_fim), local_tz)
        duracao = timedelta(minutes=duracao_min)
        passo = timedelta(minutes=horario.intervalo_min)

        # Agendamentos não cancelados/arquivados do dia para o profissional correto
        dia_inicio = timezone.make_aware(datetime.combine(data, time_type(0, 0)), local_tz)
        dia_fim = timezone.make_aware(datetime.combine(data, time_type(23, 59, 59)), local_tz)
        ags_qs = (
            Agendamento.objects
            .filter(empresa=empresa, data_hora__gte=dia_inicio, data_hora__lte=dia_fim)
            .exclude(status__in=['cancelado', 'arquivado'])
            .select_related('servico')
        )
        if profissional is not None:
            ags_qs = ags_qs.filter(profissional=profissional)
        else:
            ags_qs = ags_qs.filter(profissional__isnull=True)

        agendamentos = list(ags_qs)
        agora = timezone.now()
        slots = []
        current = inicio
        while current + duracao <= fim:
            if current < agora:
                current += passo
                continue
            slot_fim = current + duracao
            disponivel = all(
                not (
                    current < ag.data_hora + timedelta(minutes=ag.servico.duracao_min)
                    and slot_fim > ag.data_hora
                )
                for ag in agendamentos
            )
            slots.append({
                'hora': current.strftime('%H:%M'),
                'datetime': current.isoformat(),
                'disponivel': disponivel,
            })
            current += passo

        return Response({'data': data_str, 'slots': slots})

    @staticmethod
    def _resolver_horario(
        empresa: Empresa,
        dia_semana: int,
        profissional: Profissional | None,
    ) -> HorarioFuncionamento | None:
        """
        Retorna a grade aplicável seguindo a prioridade:
        1. Grade do profissional (se informado e existir)
        2. Grade geral da empresa
        """
        if profissional is not None:
            try:
                return HorarioFuncionamento.objects.get(
                    empresa=empresa, profissional=profissional, dia_semana=dia_semana
                )
            except HorarioFuncionamento.DoesNotExist:
                pass  # fallback para grade geral

        try:
            return HorarioFuncionamento.objects.get(
                empresa=empresa, profissional__isnull=True, dia_semana=dia_semana
            )
        except HorarioFuncionamento.DoesNotExist:
            return None


# ── Registro de novo prestador ────────────────────────────────────────────────

class RegistroView(generics.CreateAPIView):
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
