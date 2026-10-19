from datetime import datetime, timedelta, time as time_type
from rest_framework import viewsets, permissions, mixins, generics, status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from django.core.cache import cache
from django.db import connection, transaction
from django.db.models import Count, Max, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from . import midia
from .models import (
    Empresa, Profissional, Servico, Agendamento, AnexoAgendamento, HorarioFuncionamento,
    MidiaServico,
)
from .serializers import (
    AnexoSerializer, ConfirmarAnexoSerializer, PedidoAssinaturaSerializer,
    MidiaServicoDonoSerializer, YoutubeSerializer,
    EmpresaSerializer, EmpresaPublicSerializer,
    ProfissionalSerializer, ProfissionalPublicSerializer,
    ServicoSerializer, ServicoPublicSerializer, AgendamentoSerializer,
    HorarioFuncionamentoSerializer, RegistroSerializer,
    PerfilUsuarioSerializer,
)
from .service import (
    calcular_resumo_financeiro, calcular_volume_agendamentos, chave_cache_pagina_publica,
    resolver_grade,
)


# ── Paginação ─────────────────────────────────────────────────────────────────

class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_empresa_do_usuario(user) -> Empresa:
    return get_object_or_404(Empresa, owner=user)


class EmpresaDoUsuarioMixin:
    """Resolve a Empresa do usuário logado uma única vez por requisição."""

    def _empresa(self) -> Empresa:
        if not hasattr(self, '_empresa_cache'):
            self._empresa_cache = get_empresa_do_usuario(self.request.user)
        return self._empresa_cache

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['empresa'] = self._empresa()
        ctx['publico'] = True
        return ctx

    def perform_create(self, serializer):
        serializer.save(empresa=self._empresa())


def _parse_data(valor: str | None):
    if not valor:
        return None
    try:
        return datetime.strptime(valor, '%Y-%m-%d').date()
    except ValueError:
        return None


def _inicio_do_dia(d):
    return timezone.make_aware(datetime.combine(d, time_type(0, 0)), timezone.get_current_timezone())


# ── Dashboard (autenticado) ───────────────────────────────────────────────────

class EmpresaViewSet(viewsets.ModelViewSet):
    serializer_class = EmpresaSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'put', 'patch', 'head', 'options']
    pagination_class = None

    def get_queryset(self):
        return Empresa.objects.filter(owner=self.request.user)


class ProfissionalViewSet(EmpresaDoUsuarioMixin, viewsets.ModelViewSet):
    """CRUD de Profissionais isolado por Tenant."""
    serializer_class = ProfissionalSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardPagination

    def get_queryset(self):
        return Profissional.objects.filter(empresa=self._empresa())


class ServicoViewSet(EmpresaDoUsuarioMixin, viewsets.ModelViewSet):
    serializer_class = ServicoSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardPagination

    def get_queryset(self):
        return Servico.objects.filter(empresa=self._empresa())

    # ── Vitrine do serviço (fotos, vídeos e YouTube exibidos no "Ver mais") ──

    @staticmethod
    def _erro_cota_midias(servico, bytes_novos: int = 0, youtube_novo: bool = False) -> str | None:
        arquivos = servico.midias.exclude(tipo='youtube')
        if youtube_novo:
            if servico.midias.filter(tipo='youtube').count() >= settings.MIDIA_MAX_YOUTUBE_POR_SERVICO:
                return f'Limite de {settings.MIDIA_MAX_YOUTUBE_POR_SERVICO} vídeos do YouTube por serviço.'
            return None
        if arquivos.count() >= settings.MIDIA_MAX_ARQUIVOS_POR_SERVICO:
            return f'Limite de {settings.MIDIA_MAX_ARQUIVOS_POR_SERVICO} arquivos por serviço atingido.'
        usados = arquivos.aggregate(b=Sum('bytes'))['b'] or 0
        if usados + bytes_novos > settings.MIDIA_MAX_BYTES_POR_SERVICO:
            return (f'Limite de {settings.MIDIA_MAX_BYTES_POR_SERVICO // (1024 * 1024)} MB '
                    'por serviço seria ultrapassado.')
        return None

    @staticmethod
    def _proxima_ordem(servico) -> int:
        return (servico.midias.aggregate(m=Max('ordem'))['m'] or 0) + 1

    @action(detail=True, methods=['get', 'post'], url_path='midias')
    def midias(self, request, pk=None):
        """
        GET  /servicos/{id}/midias/ — lista as mídias da vitrine.
        POST /servicos/{id}/midias/ — {youtube_url} adiciona um vídeo do YouTube;
             {public_id, tipo, nome?} confirma um upload feito no Cloudinary.
        """
        servico = self.get_object()
        if request.method == 'GET':
            return Response(MidiaServicoDonoSerializer(servico.midias.all(), many=True).data)

        if 'youtube_url' in request.data:
            entrada = YoutubeSerializer(data=request.data)
            entrada.is_valid(raise_exception=True)
            with transaction.atomic():
                Servico.objects.select_for_update().only('id').get(pk=servico.pk)
                erro = self._erro_cota_midias(servico, youtube_novo=True)
                if erro:
                    return Response({'erro': erro}, status=status.HTTP_400_BAD_REQUEST)
                m = MidiaServico.objects.create(
                    empresa_id=servico.empresa_id, servico=servico, tipo='youtube',
                    youtube_id=entrada.validated_data['youtube_url'],
                    ordem=self._proxima_ordem(servico),
                )
            return Response(MidiaServicoDonoSerializer(m).data, status=status.HTTP_201_CREATED)

        entrada = ConfirmarAnexoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        d = entrada.validated_data
        if not midia.public_id_valido(d['public_id'], midia.pasta_do_servico(servico.empresa_id, servico.pk)):
            return Response({'public_id': 'Arquivo não pertence a este serviço.'},
                            status=status.HTTP_400_BAD_REQUEST)
        existente = MidiaServico.objects.filter(public_id=d['public_id']).first()
        if existente is not None:
            if existente.servico_id != servico.pk:
                return Response({'public_id': 'Arquivo não pertence a este serviço.'},
                                status=status.HTTP_400_BAD_REQUEST)
            return Response(MidiaServicoDonoSerializer(existente).data)
        try:
            # Ainda privado: só vira público depois de validado (promover_para_publico)
            meta = midia.obter_metadados(d['public_id'], d['tipo'])
        except midia.MidiaIndisponivel:
            return Response({'erro': 'Serviço de mídia indisponível. Tente novamente.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if meta is None or meta.public_id != d['public_id']:
            return Response({'public_id': 'Upload não encontrado no armazenamento.'},
                            status=status.HTTP_400_BAD_REQUEST)

        erro = midia.validar_metadados(meta, d['tipo'])
        m = None
        if not erro:
            try:
                with transaction.atomic():
                    Servico.objects.select_for_update().only('id').get(pk=servico.pk)
                    erro = self._erro_cota_midias(servico, meta.bytes)
                    if not erro:
                        midia.promover_para_publico(meta.public_id, d['tipo'])
                        m = MidiaServico.objects.create(
                            empresa_id=servico.empresa_id, servico=servico, tipo=d['tipo'],
                            public_id=meta.public_id, formato=meta.formato, bytes=meta.bytes,
                            largura=meta.largura, altura=meta.altura,
                            duracao_seg=meta.duracao_seg,
                            nome_original=midia.sanitizar_nome(d.get('nome') or ''),
                            ordem=self._proxima_ordem(servico),
                        )
            except midia.MidiaIndisponivel:
                # Continua privado; a limpeza de órfãos remove se não for reenviado
                return Response({'erro': 'Serviço de mídia indisponível. Tente novamente.'},
                                status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if erro:
            midia.apagar(meta.public_id, d['tipo'])  # ainda privado
            return Response({'erro': erro}, status=status.HTTP_400_BAD_REQUEST)
        return Response(MidiaServicoDonoSerializer(m).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='midias/assinatura')
    def midias_assinatura(self, request, pk=None):
        """POST /servicos/{id}/midias/assinatura/ — body: {nome, mime, tamanho}"""
        servico = self.get_object()
        pedido = PedidoAssinaturaSerializer(data=request.data)
        pedido.is_valid(raise_exception=True)
        d = pedido.validated_data
        erro = self._erro_cota_midias(servico, d['tamanho'])
        if erro:
            return Response({'erro': erro}, status=status.HTTP_400_BAD_REQUEST)
        try:
            # Upload privado; vira público só após a confirmação (ver midias())
            assinatura = midia.gerar_assinatura_upload(
                pasta=midia.pasta_do_servico(servico.empresa_id, servico.pk), tipo=d['tipo'],
            )
        except midia.MidiaIndisponivel:
            return Response({'erro': 'Armazenamento de mídia não configurado.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({**assinatura, 'tipo': d['tipo'], 'nome': d['nome']})

    @action(detail=True, methods=['patch'], url_path='midias/ordem')
    def midias_ordem(self, request, pk=None):
        """PATCH /servicos/{id}/midias/ordem/ — body: {ids: [3, 1, 2]}"""
        servico = self.get_object()
        ids = request.data.get('ids')
        atuais = set(servico.midias.values_list('id', flat=True))
        if not isinstance(ids, list) or set(ids) != atuais or len(ids) != len(atuais):
            return Response({'ids': 'Envie todos os IDs das mídias deste serviço, na nova ordem.'},
                            status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            for ordem, mid in enumerate(ids):
                MidiaServico.objects.filter(pk=mid, servico=servico).update(ordem=ordem)
        cache.delete(chave_cache_pagina_publica(servico.empresa.slug))  # update() não dispara signal
        return Response(MidiaServicoDonoSerializer(servico.midias.all(), many=True).data)

    @action(detail=True, methods=['delete'], url_path=r'midias/(?P<midia_id>[0-9]+)')
    def midia_remover(self, request, pk=None, midia_id=None):
        """DELETE /servicos/{id}/midias/{midia_id}/"""
        servico = self.get_object()
        get_object_or_404(servico.midias, pk=midia_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AgendamentoViewSet(EmpresaDoUsuarioMixin, viewsets.ModelViewSet):
    """
    CRUD de Agendamentos isolado por Tenant.
    Filtros: ?status=pendente  |  ?profissional_id=N
             ?data_inicio=YYYY-MM-DD  |  ?data_fim=YYYY-MM-DD (inclusivo, fuso local)
             ?ordem=desc  (padrão: data_hora crescente)
    """
    serializer_class = AgendamentoSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardPagination

    def get_queryset(self):
        params = self.request.query_params
        qs = (
            Agendamento.objects
            .filter(empresa=self._empresa())
            .select_related('servico', 'profissional')
            .prefetch_related('agendamento_servicos__servico')
            .annotate(total_anexos=Count('anexos'))
            .order_by('-data_hora' if params.get('ordem') == 'desc' else 'data_hora')
        )
        status_param = params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        profissional_id = params.get('profissional_id')
        if profissional_id:
            qs = qs.filter(profissional_id=profissional_id)

        data_inicio = _parse_data(params.get('data_inicio'))
        if data_inicio:
            qs = qs.filter(data_hora__gte=_inicio_do_dia(data_inicio))
        data_fim = _parse_data(params.get('data_fim'))
        if data_fim:
            qs = qs.filter(data_hora__lt=_inicio_do_dia(data_fim + timedelta(days=1)))

        return qs

    @action(detail=False, methods=['get'], url_path='resumo')
    def resumo(self, request):
        """
        GET /api/v1/agendamentos/resumo/ — contadores leves para o cabeçalho e o
        polling do painel: agendamentos de hoje, pendentes a partir de hoje e o
        criado_em mais recente (o front só recarrega a lista quando ele muda).
        """
        base = Agendamento.objects.filter(empresa=self._empresa())
        hoje = timezone.localdate()
        inicio_hoje = _inicio_do_dia(hoje)
        return Response({
            'hoje': base.filter(
                data_hora__gte=inicio_hoje,
                data_hora__lt=_inicio_do_dia(hoje + timedelta(days=1)),
            ).exclude(status='arquivado').count(),
            'pendentes': base.filter(status='pendente', data_hora__gte=inicio_hoje).count(),
            'ultimo_criado_em': base.aggregate(m=Max('criado_em'))['m'],
        })

    @action(detail=False, methods=['get'], url_path='volume')
    def volume(self, request):
        """GET /api/v1/agendamentos/volume/ — volume por dia da semana e por hora."""
        return Response(calcular_volume_agendamentos(self._empresa()))

    # ── Anexos (fotos e vídeos do dono) ──────────────────────────────────────
    # Todas as ações usam get_object(): o agendamento precisa pertencer à empresa
    # do usuário logado, senão 404 — um dono nunca vê anexos de outra empresa.

    def _cota_anexos(self, agendamento, ignorar_id=None) -> dict:
        qs = agendamento.anexos.all()
        if ignorar_id:
            qs = qs.exclude(pk=ignorar_id)
        agg = qs.aggregate(total=Count('id'), bytes=Sum('bytes'))
        return {
            'arquivos': agg['total'] or 0,
            'bytes': agg['bytes'] or 0,
            'max_arquivos': settings.MIDIA_MAX_ARQUIVOS_POR_AGENDAMENTO,
            'max_bytes': settings.MIDIA_MAX_BYTES_POR_AGENDAMENTO,
        }

    @staticmethod
    def _erro_cota(cota: dict, bytes_novos: int) -> str | None:
        if cota['arquivos'] >= cota['max_arquivos']:
            return f'Limite de {cota["max_arquivos"]} arquivos por agendamento atingido.'
        if cota['bytes'] + bytes_novos > cota['max_bytes']:
            return (f'Limite de {cota["max_bytes"] // (1024 * 1024)} MB por agendamento '
                    'seria ultrapassado.')
        return None

    @action(detail=True, methods=['get', 'post'], url_path='anexos')
    def anexos(self, request, pk=None):
        """
        GET  /agendamentos/{id}/anexos/ — lista os anexos (URLs assinadas) e a cota.
        POST /agendamentos/{id}/anexos/ — confirma um upload já feito no Cloudinary.
             body: {public_id, tipo, nome?, substituir_id?}
        """
        agendamento = self.get_object()
        if request.method == 'GET':
            return Response({
                'anexos': AnexoSerializer(agendamento.anexos.all(), many=True).data,
                'cota': self._cota_anexos(agendamento),
            })

        entrada = ConfirmarAnexoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        d = entrada.validated_data
        pasta = midia.pasta_do_agendamento(agendamento.empresa_id, agendamento.pk)
        if not midia.public_id_valido(d['public_id'], pasta):
            # Só aceitamos arquivos enviados com assinatura desta empresa/agendamento
            return Response({'public_id': 'Arquivo não pertence a este agendamento.'},
                            status=status.HTTP_400_BAD_REQUEST)

        substituido = None
        if d.get('substituir_id'):
            substituido = agendamento.anexos.filter(pk=d['substituir_id']).first()
            if substituido is None:
                return Response({'substituir_id': 'Anexo não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            meta = midia.obter_metadados(d['public_id'], d['tipo'])
        except midia.MidiaIndisponivel:
            return Response({'erro': 'Serviço de mídia indisponível. Tente novamente.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if meta is None or meta.public_id != d['public_id']:
            return Response({'public_id': 'Upload não encontrado no armazenamento.'},
                            status=status.HTTP_400_BAD_REQUEST)
        ja_existe = AnexoAgendamento.objects.filter(public_id=meta.public_id).first()
        if ja_existe is not None:
            if ja_existe.agendamento_id != agendamento.pk:
                return Response({'public_id': 'Arquivo não pertence a este agendamento.'},
                                status=status.HTTP_400_BAD_REQUEST)
            return Response(AnexoSerializer(ja_existe).data)  # confirmação repetida (idempotente)

        # Validação autoritativa: formato detectado pelo Cloudinary a partir do conteúdo
        erro = midia.validar_metadados(meta, d['tipo'])
        if erro:
            midia.apagar(meta.public_id, d['tipo'])
            return Response({'erro': erro}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Trava o agendamento: confirmações simultâneas não estouram a cota
            Agendamento.objects.select_for_update().only('id').get(pk=agendamento.pk)
            erro = self._erro_cota(
                self._cota_anexos(agendamento, ignorar_id=substituido.pk if substituido else None),
                meta.bytes,
            )
            if erro is None:
                anexo = AnexoAgendamento.objects.create(
                    public_id=meta.public_id,
                    empresa_id=agendamento.empresa_id, agendamento=agendamento, tipo=d['tipo'],
                    formato=meta.formato, bytes=meta.bytes, largura=meta.largura,
                    altura=meta.altura, duracao_seg=meta.duracao_seg,
                    nome_original=midia.sanitizar_nome(d.get('nome') or ''),
                )
                if substituido is not None:
                    substituido.delete()  # o signal apaga o arquivo antigo após o commit
        if erro:
            midia.apagar(meta.public_id, d['tipo'])
            return Response({'erro': erro}, status=status.HTTP_400_BAD_REQUEST)
        return Response(AnexoSerializer(anexo).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='anexos/assinatura')
    def anexos_assinatura(self, request, pk=None):
        """
        POST /agendamentos/{id}/anexos/assinatura/ — body: {nome, mime, tamanho}
        Valida tipo, tamanho e cota e devolve os parâmetros assinados para o
        navegador enviar o arquivo direto ao Cloudinary.
        """
        agendamento = self.get_object()
        pedido = PedidoAssinaturaSerializer(data=request.data)
        pedido.is_valid(raise_exception=True)
        d = pedido.validated_data
        substituir_id = request.data.get('substituir_id')
        substituir_id = int(substituir_id) if str(substituir_id or '').isdigit() else None
        erro = self._erro_cota(
            self._cota_anexos(agendamento, ignorar_id=substituir_id), d['tamanho'],
        )
        if erro:
            return Response({'erro': erro}, status=status.HTTP_400_BAD_REQUEST)
        try:
            assinatura = midia.gerar_assinatura_upload(
                pasta=midia.pasta_do_agendamento(agendamento.empresa_id, agendamento.pk),
                tipo=d['tipo'],
            )
        except midia.MidiaIndisponivel:
            return Response({'erro': 'Armazenamento de mídia não configurado.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({**assinatura, 'tipo': d['tipo'], 'nome': d['nome']})

    @action(detail=True, methods=['delete'], url_path=r'anexos/(?P<anexo_id>[0-9]+)')
    def anexo_remover(self, request, pk=None, anexo_id=None):
        """DELETE /agendamentos/{id}/anexos/{anexo_id}/"""
        agendamento = self.get_object()
        anexo = get_object_or_404(agendamento.anexos, pk=anexo_id)
        anexo.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

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


class HorarioFuncionamentoViewSet(EmpresaDoUsuarioMixin, viewsets.ModelViewSet):
    """
    CRUD dos horários de funcionamento.
    Suporta grade geral (?profissional_id=null) e por profissional (?profissional_id=N).
    """
    serializer_class = HorarioFuncionamentoSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = HorarioFuncionamento.objects.filter(empresa=self._empresa())
        profissional_id = self.request.query_params.get('profissional_id')
        if profissional_id == 'null' or profissional_id == '':
            qs = qs.filter(profissional__isnull=True)
        elif profissional_id:
            qs = qs.filter(profissional_id=profissional_id)
        return qs


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

class PaginaPublicaView(APIView):
    """
    GET /api/v1/public/<slug>/pagina/
    Tudo o que a página pública precisa no carregamento (empresa, serviços e
    profissionais ativos) em uma única resposta, com cache de 60 s — invalidado
    quando o dono altera empresa, serviços ou profissionais (ver signals.py).
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    MAX_ITENS = 200

    def get(self, request, slug: str):
        chave = chave_cache_pagina_publica(slug)
        dados = cache.get(chave)
        if dados is None:
            empresa = get_object_or_404(Empresa, slug=slug)
            dados = {
                'empresa': EmpresaPublicSerializer(empresa).data,
                'servicos': ServicoPublicSerializer(
                    Servico.objects.filter(empresa=empresa).prefetch_related('midias')[:self.MAX_ITENS],
                    many=True,
                ).data,
                'profissionais': ProfissionalPublicSerializer(
                    Profissional.objects.filter(empresa=empresa, ativo=True)[:self.MAX_ITENS],
                    many=True,
                ).data,
            }
            cache.set(chave, dados, 60)
        resp = Response(dados)
        resp['Cache-Control'] = 'public, max-age=30'
        return resp


class HealthCheckView(APIView):
    """GET /api/v1/health/ — health check do Render e alvo do ping anti-cold-start."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            with connection.cursor() as cur:
                cur.execute('SELECT 1')
        except Exception:
            return Response({'status': 'erro', 'banco': 'indisponivel'}, status=503)
        return Response({'status': 'ok'})


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
    authentication_classes = []

    def _empresa(self) -> Empresa:
        if not hasattr(self, '_empresa_cache'):
            self._empresa_cache = get_object_or_404(Empresa, slug=self.kwargs['slug'])
        return self._empresa_cache

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['empresa'] = self._empresa()
        ctx['publico'] = True
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
    authentication_classes = []

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
            except (Profissional.DoesNotExist, ValueError):
                pass  # cai para a grade geral

        horario = self._resolver_horario(empresa, dia_semana, profissional)
        if horario is None:
            return Response({'data': data_str, 'slots': [], 'fechado': True})

        # Duração total do slot — suporta múltiplos serviços (servicos_ids=1,2,3)
        # ou serviço único legado (servico_id=N)
        duracao_min = horario.intervalo_min
        servicos_ids_param = request.query_params.get('servicos_ids')
        servico_id = request.query_params.get('servico_id')
        if servicos_ids_param:
            ids = [int(x) for x in servicos_ids_param.split(',') if x.strip().isdigit()]
            if ids:
                total = sum(
                    s.duracao_min
                    for s in Servico.objects.filter(pk__in=ids, empresa=empresa)
                )
                if total > 0:
                    duracao_min = total
        elif servico_id:
            try:
                servico = Servico.objects.get(pk=servico_id, empresa=empresa)
                duracao_min = servico.duracao_min
            except (Servico.DoesNotExist, ValueError):
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
        )
        if profissional is not None:
            ags_qs = ags_qs.filter(profissional=profissional)
        else:
            ags_qs = ags_qs.filter(profissional__isnull=True)

        agendamentos = list(ags_qs.only('data_hora', 'duracao_total_min'))
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
                    current < ag.data_hora + timedelta(minutes=ag.duracao_total_min)
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

    _resolver_horario = staticmethod(resolver_grade)


# ── Perfil do usuário logado ──────────────────────────────────────────────────

class PerfilUsuarioView(APIView):
    """
    GET  /api/v1/usuario/ — retorna username e e-mail do usuário logado
    PATCH /api/v1/usuario/ — atualiza username, e-mail e/ou senha
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({'username': user.username, 'email': user.email})

    def patch(self, request):
        serializer = PerfilUsuarioSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        user = request.user
        vd   = serializer.validated_data

        if 'username' in vd:
            user.username = vd['username']
        if 'email' in vd:
            user.email = vd['email']
        if vd.get('password_nova'):
            user.set_password(vd['password_nova'])

        user.save()
        return Response({'username': user.username, 'email': user.email})


# ── Registro de novo prestador ────────────────────────────────────────────────

class RegistroView(generics.CreateAPIView):
    serializer_class = RegistroSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

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
