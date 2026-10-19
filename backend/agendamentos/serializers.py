import re
from decimal import Decimal
from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from . import midia, youtube
from .service import erro_fora_da_grade
from .models import (
    Empresa, Profissional, Servico, Agendamento,
    AgendamentoServico, AnexoAgendamento, HorarioFuncionamento, MidiaServico,
)


# ── Helpers de validação ───────────────────────────────────────────────────────

_PHONE_DIGITS_RE = re.compile(r'^\d{10,11}$')
_HEX_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


def _luminancia(hex_cor: str) -> float:
    """Luminância relativa (WCAG 2.x) de uma cor #RRGGBB."""
    def canal(c: int) -> float:
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hex_cor[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)


def _validar_cor_destaque(valor: str) -> str:
    """
    Aceita #RRGGBB com contraste mínimo de 4,5:1 contra branco OU contra a tinta
    (#17262A) — o front escolhe o texto que contrasta. Recusa tons médios em que
    nenhum texto fica legível (WCAG AA).
    """
    valor = (valor or '').strip()
    if not _HEX_RE.match(valor):
        raise serializers.ValidationError('Use uma cor no formato #RRGGBB, por exemplo #165C50.')
    lum = _luminancia(valor)
    contraste_branco = 1.05 / (lum + 0.05)
    contraste_tinta = (lum + 0.05) / (_luminancia('#17262A') + 0.05)
    if max(contraste_branco, contraste_tinta) < 4.5:
        raise serializers.ValidationError(
            'Essa cor deixa o texto dos botões ilegível. Escolha um tom mais escuro ou mais claro.'
        )
    return valor.upper()

_VALID_DDDS = {
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99,
}


def _validar_telefone_br(valor: str) -> str:
    """Normaliza e valida número de WhatsApp brasileiro. Retorna apenas dígitos."""
    digitos = re.sub(r'\D', '', valor)
    if digitos.startswith('55') and len(digitos) in (12, 13):
        digitos = digitos[2:]
    if not _PHONE_DIGITS_RE.match(digitos):
        raise serializers.ValidationError(
            'Informe um WhatsApp válido com DDD. Ex: 85999990000 ou (85) 99999-0000.'
        )
    ddd = int(digitos[:2])
    if ddd not in _VALID_DDDS:
        raise serializers.ValidationError(
            f'DDD {ddd:02d} inválido. Informe um DDD brasileiro válido (ex: 85, 11, 21).'
        )
    return digitos


# ── Empresa ───────────────────────────────────────────────────────────────────

class EmpresaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ['id', 'nome_fantasia', 'slug', 'whatsapp_contato', 'cor_destaque']
        read_only_fields = ['id']

    def validate_cor_destaque(self, value: str) -> str:
        return _validar_cor_destaque(value)

    def validate_nome_fantasia(self, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError(
                'O nome da empresa deve ter pelo menos 2 caracteres.'
            )
        return value

    def validate_whatsapp_contato(self, value: str) -> str:
        return _validar_telefone_br(value)


class EmpresaPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ['id', 'nome_fantasia', 'slug', 'whatsapp_contato', 'cor_destaque']


# ── Profissional ──────────────────────────────────────────────────────────────

class ProfissionalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profissional
        fields = ['id', 'empresa', 'nome', 'especialidade', 'ativo', 'criado_em', 'atualizado_em']
        read_only_fields = ['id', 'empresa', 'criado_em', 'atualizado_em']

    def validate_nome(self, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError(
                'O nome do profissional deve ter pelo menos 2 caracteres.'
            )
        return value

    def validate_especialidade(self, value: str) -> str:
        return value.strip()


class ProfissionalPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profissional
        fields = ['id', 'nome', 'especialidade']


# ── Servico ───────────────────────────────────────────────────────────────────

class ServicoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Servico
        fields = ['id', 'empresa', 'nome', 'descricao', 'duracao_min', 'preco', 'criado_em', 'atualizado_em']
        read_only_fields = ['id', 'empresa', 'criado_em', 'atualizado_em']

    def validate_nome(self, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError('O nome do serviço deve ter pelo menos 2 caracteres.')
        return value

    def validate_duracao_min(self, value: int) -> int:
        if value < 5:
            raise serializers.ValidationError('A duração mínima do serviço é de 5 minutos.')
        if value > 480:
            raise serializers.ValidationError('A duração máxima do serviço é de 480 minutos (8 horas).')
        return value

    def validate_preco(self, value) -> object:
        if value < 0:
            raise serializers.ValidationError('O preço não pode ser negativo.')
        return value


class MidiaServicoSerializer(serializers.ModelSerializer):
    """Mídia da vitrine do serviço. URLs públicas (CDN do Cloudinary / YouTube)."""
    url = serializers.SerializerMethodField()
    thumb_url = serializers.SerializerMethodField()
    embed_url = serializers.SerializerMethodField()

    class Meta:
        model = MidiaServico
        fields = [
            'id', 'tipo', 'url', 'thumb_url', 'embed_url', 'youtube_id',
            'largura', 'altura', 'duracao_seg', 'ordem',
        ]
        read_only_fields = fields

    def _urls(self, obj) -> dict:
        if obj.tipo == 'youtube':
            return {'url': None, 'thumb_url': youtube.url_miniatura(obj.youtube_id)}
        return midia.urls_assinadas(obj.public_id, obj.tipo, entrega=midia.ENTREGA_PUBLICA)

    def get_url(self, obj):
        return self._urls(obj)['url']

    def get_thumb_url(self, obj):
        return self._urls(obj)['thumb_url']

    def get_embed_url(self, obj):
        return youtube.url_embed(obj.youtube_id) if obj.tipo == 'youtube' else None


class MidiaServicoDonoSerializer(MidiaServicoSerializer):
    class Meta(MidiaServicoSerializer.Meta):
        fields = MidiaServicoSerializer.Meta.fields + ['formato', 'bytes', 'nome_original', 'criado_em']
        read_only_fields = fields


class ServicoPublicSerializer(serializers.ModelSerializer):
    """Versão pública — sem metadados internos (empresa, timestamps)."""
    midias = MidiaServicoSerializer(many=True, read_only=True)

    class Meta:
        model = Servico
        fields = ['id', 'nome', 'descricao', 'duracao_min', 'preco', 'midias']


# ── Agendamento ───────────────────────────────────────────────────────────────

class AgendamentoSerializer(serializers.ModelSerializer):
    # Campos legados de serviço único (read-only, backward compat)
    servico_nome = serializers.CharField(source='servico.nome', read_only=True, default=None)
    servico_preco = serializers.DecimalField(
        source='servico.preco', max_digits=8, decimal_places=2, read_only=True, default=None
    )
    profissional_nome = serializers.CharField(
        source='profissional.nome', read_only=True, default=None
    )

    # Multi-serviço: campo de escrita (lista de IDs enviada pelo cliente)
    servicos_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        write_only=True,
        required=False,
    )
    # Multi-serviço: campo de leitura (detalhes dos serviços vinculados)
    servicos_info = serializers.SerializerMethodField(read_only=True)
    # Anotado na listagem do painel; ausente nas respostas públicas
    total_anexos = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Agendamento
        fields = [
            'id', 'empresa',
            'servico', 'servico_nome', 'servico_preco',
            'servicos_ids', 'servicos_info',
            'profissional', 'profissional_nome',
            'nome_cliente', 'whatsapp_cliente', 'data_hora', 'status',
            'duracao_total_min', 'preco_total', 'total_anexos',
            'criado_em', 'atualizado_em',
        ]
        read_only_fields = [
            'id', 'empresa',
            'servico_nome', 'servico_preco', 'profissional_nome',
            'status', 'servicos_info', 'duracao_total_min', 'preco_total',
            'criado_em', 'atualizado_em',
        ]
        extra_kwargs = {
            'servico': {'required': False, 'allow_null': True},
        }

    def get_servicos_info(self, obj) -> list:
        """
        Retorna os serviços na ordem escolhida pelo cliente; fallback para a FK
        `servico` em dados legados. Usa o prefetch de `agendamento_servicos__servico`
        quando a view o fornece (evita N+1 na listagem).
        """
        servicos = [link.servico for link in obj.agendamento_servicos.all()]
        if not servicos and obj.servico:
            servicos = [obj.servico]
        return [
            {
                'id': s.id,
                'nome': s.nome,
                'duracao_min': s.duracao_min,
                'preco': str(s.preco),
            }
            for s in servicos
        ]

    def validate_nome_cliente(self, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError(
                'Informe seu nome completo (mínimo 2 caracteres).'
            )
        if len(value) > 100:
            raise serializers.ValidationError('O nome não pode ter mais de 100 caracteres.')
        return value

    def validate_whatsapp_cliente(self, value: str) -> str:
        return _validar_telefone_br(value)

    def validate(self, data: dict) -> dict:
        empresa = self.context.get('empresa') or getattr(self.instance, 'empresa', None)
        servicos_ids = data.pop('servicos_ids', [])
        servico = data.get('servico')
        data_hora = data.get('data_hora') or getattr(self.instance, 'data_hora', None)
        profissional = data.get('profissional', getattr(self.instance, 'profissional', None))

        # ── Resolve a lista de serviços ──────────────────────────────────────
        if servicos_ids:
            servicos = list(Servico.objects.filter(pk__in=servicos_ids, empresa=empresa))
            if len(servicos) != len(servicos_ids):
                raise serializers.ValidationError(
                    {'servicos_ids': 'Um ou mais serviços não pertencem a esta empresa.'}
                )
            # Preserva a ordem em que o cliente selecionou
            ordem_map = {sid: i for i, sid in enumerate(servicos_ids)}
            servicos.sort(key=lambda s: ordem_map[s.pk])
            # Mantém servico FK apontando para o primeiro (backward compat)
            data['servico'] = servicos[0]
        elif servico:
            if empresa and servico.empresa_id != empresa.pk:
                raise serializers.ValidationError(
                    {'servico': 'O serviço não pertence à empresa informada.'}
                )
            servicos = [servico]
        elif self.instance:
            # PATCH sem mudança de serviço — usa estado atual do registro
            servicos = []
        else:
            raise serializers.ValidationError(
                {'servicos_ids': 'Selecione pelo menos um serviço.'}
            )

        if profissional and empresa and profissional.empresa_id != empresa.pk:
            raise serializers.ValidationError(
                {'profissional': 'O profissional não pertence à empresa informada.'}
            )

        # Profissional inativo não recebe reservas novas (nem pelo painel)
        muda_profissional = not self.instance or 'profissional' in data
        if profissional and muda_profissional and not profissional.ativo:
            raise serializers.ValidationError(
                {'profissional': 'Este profissional não está atendendo no momento.'}
            )
        # Na página pública, quem tem equipe precisa indicar o profissional:
        # sem isso a reserva cairia numa agenda "sem profissional" paralela (overbooking).
        publico = self.context.get('publico', False)
        if publico and not profissional and empresa and Profissional.objects.filter(empresa=empresa, ativo=True).exists():
            raise serializers.ValidationError({'profissional': 'Escolha um profissional.'})

        # ── Agendamento deve ser no futuro (apenas na criação) ────────────────
        if data_hora and not self.instance:
            if data_hora <= timezone.now():
                raise serializers.ValidationError(
                    {'data_hora': 'O agendamento deve ser para uma data e hora futuras.'}
                )

        # ── Duração total para verificação de conflito ────────────────────────
        if servicos:
            duracao_total = sum(s.duracao_min for s in servicos)
        else:
            duracao_total = self.instance.duracao_total_min if self.instance else 0

        # A página pública só aceita horários dentro da grade de funcionamento
        if publico and data_hora and empresa:
            erro = erro_fora_da_grade(empresa, data_hora, duracao_total, profissional)
            if erro:
                raise serializers.ValidationError({'data_hora': erro})

        if data_hora and empresa and duracao_total > 0:
            self._validar_conflito_horario(empresa, duracao_total, data_hora, profissional)

        data['_servicos_list'] = servicos
        data['_duracao_total'] = duracao_total

        return data

    def _validar_conflito_horario(
        self,
        empresa: Empresa,
        duracao_total: int,
        data_hora,
        profissional,
    ) -> None:
        novo_inicio = data_hora
        novo_fim = data_hora + timedelta(minutes=duracao_total)

        qs = (
            Agendamento.objects
            .filter(empresa=empresa, data_hora__lt=novo_fim)
            .exclude(status__in=['cancelado', 'arquivado'])
        )

        if profissional is not None:
            qs = qs.filter(profissional=profissional)
        else:
            qs = qs.filter(profissional__isnull=True)

        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        for ag in qs:
            existente_fim = ag.data_hora + timedelta(minutes=ag.duracao_total_min)
            if existente_fim > novo_inicio:
                raise serializers.ValidationError({
                    'data_hora': (
                        f'Horário indisponível. Já existe um agendamento de '
                        f'{ag.data_hora.strftime("%H:%M")} até '
                        f'{existente_fim.strftime("%H:%M")}.'
                    )
                })

    @transaction.atomic
    def create(self, validated_data: dict) -> Agendamento:
        servicos = validated_data.pop('_servicos_list', [])
        duracao_total = validated_data.pop('_duracao_total', 0)

        # Serializa as reservas concorrentes da mesma empresa: trava a linha da
        # Empresa e repete a checagem de conflito já dentro da transação. Sem isso,
        # duas requisições simultâneas passam no validate() e gravam o mesmo horário.
        empresa = validated_data.get('empresa') or self.context.get('empresa')
        if empresa is not None:
            Empresa.objects.select_for_update().only('id').get(pk=empresa.pk)
            if duracao_total > 0:
                self._validar_conflito_horario(
                    empresa, duracao_total, validated_data['data_hora'],
                    validated_data.get('profissional'),
                )

        validated_data['duracao_total_min'] = duracao_total
        validated_data['preco_total'] = (
            sum(s.preco for s in servicos) if servicos else Decimal('0.00')
        )

        agendamento = super().create(validated_data)

        for ordem, s in enumerate(servicos):
            AgendamentoServico.objects.create(
                agendamento=agendamento, servico=s, ordem=ordem
            )

        return agendamento

    @transaction.atomic
    def update(self, instance: Agendamento, validated_data: dict) -> Agendamento:
        servicos = validated_data.pop('_servicos_list', [])
        duracao_total = validated_data.pop('_duracao_total', None)

        # Mesma proteção contra concorrência do create(), quando muda horário/serviços
        if duracao_total and ('data_hora' in validated_data or servicos or 'profissional' in validated_data):
            Empresa.objects.select_for_update().only('id').get(pk=instance.empresa_id)
            self._validar_conflito_horario(
                instance.empresa, duracao_total,
                validated_data.get('data_hora', instance.data_hora),
                validated_data.get('profissional', instance.profissional),
            )

        instance = super().update(instance, validated_data)

        if servicos:
            AgendamentoServico.objects.filter(agendamento=instance).delete()
            for ordem, s in enumerate(servicos):
                AgendamentoServico.objects.create(
                    agendamento=instance, servico=s, ordem=ordem
                )
            instance.duracao_total_min = sum(s.duracao_min for s in servicos)
            instance.preco_total = sum(s.preco for s in servicos)
            instance.save(update_fields=['duracao_total_min', 'preco_total'])

        return instance


# ── Anexos de mídia ───────────────────────────────────────────────────────────

class AnexoSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    thumb_url = serializers.SerializerMethodField()

    class Meta:
        model = AnexoAgendamento
        fields = [
            'id', 'tipo', 'formato', 'bytes', 'largura', 'altura', 'duracao_seg',
            'nome_original', 'criado_em', 'url', 'thumb_url',
        ]
        read_only_fields = fields

    def _urls(self, obj) -> dict:
        cache = self.context.setdefault('_urls_anexos', {})
        if obj.pk not in cache:
            cache[obj.pk] = midia.urls_assinadas(obj.public_id, obj.tipo)
        return cache[obj.pk]

    def get_url(self, obj):
        return self._urls(obj)['url']

    def get_thumb_url(self, obj):
        return self._urls(obj)['thumb_url']


class PedidoAssinaturaSerializer(serializers.Serializer):
    """Validação prévia do arquivo antes de autorizar o upload."""
    nome = serializers.CharField(max_length=255)
    mime = serializers.CharField(max_length=100)
    tamanho = serializers.IntegerField(min_value=1)

    def validate(self, data):
        tipo_mime = midia.MIME_PARA_TIPO.get(data['mime'].lower())
        tipo_ext = midia.tipo_por_extensao(data['nome'])
        if not tipo_mime or not tipo_ext or tipo_mime != tipo_ext:
            raise serializers.ValidationError(
                {'nome': 'Tipo de arquivo não permitido. Envie JPG, PNG, WEBP, MP4 ou WEBM.'}
            )
        limite = midia.limite_bytes(tipo_mime)
        if data['tamanho'] > limite:
            raise serializers.ValidationError({
                'tamanho': f'Arquivo muito grande. Limite para '
                           f'{"imagens" if tipo_mime == "imagem" else "vídeos"}: {limite // (1024 * 1024)} MB.'
            })
        data['tipo'] = tipo_mime
        data['nome'] = midia.sanitizar_nome(data['nome'])
        return data


class YoutubeSerializer(serializers.Serializer):
    youtube_url = serializers.CharField(max_length=500)

    def validate_youtube_url(self, valor):
        video_id = youtube.extrair_youtube_id(valor)
        if not video_id:
            raise serializers.ValidationError(
                'Link do YouTube inválido. Use youtube.com/watch?v=… ou youtu.be/…'
            )
        return video_id


class ConfirmarAnexoSerializer(serializers.Serializer):
    public_id = serializers.CharField(max_length=255)
    tipo = serializers.ChoiceField(choices=['imagem', 'video'])
    nome = serializers.CharField(max_length=255, required=False, allow_blank=True)
    substituir_id = serializers.IntegerField(required=False, min_value=1)


# ── HorarioFuncionamento ──────────────────────────────────────────────────────

class HorarioFuncionamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = HorarioFuncionamento
        fields = [
            'id', 'empresa', 'profissional', 'dia_semana',
            'hora_inicio', 'hora_fim', 'intervalo_min',
            'criado_em', 'atualizado_em',
        ]
        read_only_fields = ['id', 'empresa', 'criado_em', 'atualizado_em']

    def validate_intervalo_min(self, value: int) -> int:
        if value < 5:
            raise serializers.ValidationError('O intervalo mínimo entre slots é de 5 minutos.')
        if value > 240:
            raise serializers.ValidationError('O intervalo máximo entre slots é de 240 minutos (4 horas).')
        return value

    def validate(self, data: dict) -> dict:
        hora_inicio = data.get('hora_inicio') or getattr(self.instance, 'hora_inicio', None)
        hora_fim = data.get('hora_fim') or getattr(self.instance, 'hora_fim', None)
        if hora_inicio and hora_fim and hora_inicio >= hora_fim:
            raise serializers.ValidationError(
                {'hora_fim': 'Hora fim deve ser posterior à hora início.'}
            )

        empresa = self.context.get('empresa') or getattr(self.instance, 'empresa', None)
        profissional = data.get('profissional', getattr(self.instance, 'profissional', None))
        dia_semana = data.get('dia_semana') or getattr(self.instance, 'dia_semana', None)

        if empresa and dia_semana is not None:
            qs = HorarioFuncionamento.objects.filter(empresa=empresa, dia_semana=dia_semana)
            if profissional is not None:
                qs = qs.filter(profissional=profissional)
            else:
                qs = qs.filter(profissional__isnull=True)

            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)

            if qs.exists():
                quem = f'o profissional #{profissional.pk}' if profissional else 'a empresa'
                raise serializers.ValidationError({
                    'dia_semana': (
                        f'Já existe um horário cadastrado para {quem} neste dia da semana.'
                    )
                })

        return data


# ── Perfil do usuário ─────────────────────────────────────────────────────────

class PerfilUsuarioSerializer(serializers.Serializer):
    username              = serializers.CharField(required=False)
    email                 = serializers.EmailField(required=False)
    password_atual        = serializers.CharField(write_only=True, required=False)
    password_nova         = serializers.CharField(write_only=True, required=False, min_length=8)
    password_nova_confirm = serializers.CharField(write_only=True, required=False)

    def validate_username(self, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError('O nome de usuário deve ter pelo menos 3 caracteres.')
        if not re.match(r'^[a-zA-Z0-9_]+$', value):
            raise serializers.ValidationError('Apenas letras, números e underscores são permitidos.')
        user = self.context['request'].user
        if User.objects.filter(username=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('Este nome de usuário já está em uso.')
        return value

    def validate_email(self, value: str) -> str:
        value = value.strip().lower()
        user = self.context['request'].user
        if User.objects.filter(email=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('Este e-mail já está cadastrado.')
        return value

    def validate(self, data: dict) -> dict:
        password_nova         = data.get('password_nova')
        password_nova_confirm = data.get('password_nova_confirm')
        password_atual        = data.get('password_atual')

        if any([password_nova, password_nova_confirm, password_atual]):
            if not password_atual:
                raise serializers.ValidationError(
                    {'password_atual': 'Informe sua senha atual para alterá-la.'}
                )
            if not self.context['request'].user.check_password(password_atual):
                raise serializers.ValidationError(
                    {'password_atual': 'Senha atual incorreta.'}
                )
            if not password_nova:
                raise serializers.ValidationError({'password_nova': 'Informe a nova senha.'})
            if len(password_nova) < 8:
                raise serializers.ValidationError(
                    {'password_nova': 'A senha deve ter pelo menos 8 caracteres.'}
                )
            if password_nova != password_nova_confirm:
                raise serializers.ValidationError(
                    {'password_nova_confirm': 'As senhas não conferem.'}
                )
            try:
                validate_password(password_nova, user=self.context['request'].user)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({'password_nova': list(exc.messages)})
        return data


# ── Registro ──────────────────────────────────────────────────────────────────

_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_]+$')


class RegistroSerializer(serializers.Serializer):
    username         = serializers.CharField(max_length=150)
    email            = serializers.EmailField()
    password         = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    nome_fantasia    = serializers.CharField(max_length=150)
    slug             = serializers.SlugField(min_length=3)
    whatsapp_contato = serializers.CharField(max_length=20)

    def validate_username(self, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError('O nome de usuário deve ter pelo menos 3 caracteres.')
        if not _USERNAME_RE.match(value):
            raise serializers.ValidationError(
                'O nome de usuário deve conter apenas letras, números e underscores.'
            )
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('Este nome de usuário já está em uso.')
        return value

    def validate_email(self, value: str) -> str:
        value = value.strip().lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Este e-mail já está cadastrado.')
        return value

    def validate_nome_fantasia(self, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError('O nome da empresa deve ter pelo menos 2 caracteres.')
        return value

    def validate_slug(self, value: str) -> str:
        if len(value) < 3:
            raise serializers.ValidationError('O link público deve ter pelo menos 3 caracteres.')
        if Empresa.objects.filter(slug=value).exists():
            raise serializers.ValidationError('Este slug já está em uso.')
        return value

    def validate_whatsapp_contato(self, value: str) -> str:
        return _validar_telefone_br(value)

    def validate(self, data: dict) -> dict:
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'As senhas não conferem.'})
        # Mesmas regras do Django (tamanho, senhas comuns, só números, parecida com o usuário)
        candidato = User(username=data.get('username', ''), email=data.get('email', ''))
        try:
            validate_password(data['password'], user=candidato)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)})
        return data

    def create(self, validated_data: dict):
        validated_data.pop('password_confirm')
        with transaction.atomic():
            user = User.objects.create_user(
                username=validated_data['username'],
                email=validated_data['email'],
                password=validated_data['password'],
            )
            empresa = Empresa.objects.create(
                owner=user,
                nome_fantasia=validated_data['nome_fantasia'],
                slug=validated_data['slug'],
                whatsapp_contato=validated_data['whatsapp_contato'],
            )
        return user, empresa
