import re
from rest_framework import serializers
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from .models import Empresa, Profissional, Servico, Agendamento, HorarioFuncionamento


# ── Helpers de validação ───────────────────────────────────────────────────────

_PHONE_DIGITS_RE = re.compile(r'^\d{10,11}$')

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
    # Remove prefixo internacional +55 ou 55 quando presente
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
        fields = ['id', 'nome_fantasia', 'slug', 'whatsapp_contato']
        read_only_fields = ['id']

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
        fields = ['id', 'nome_fantasia', 'slug', 'whatsapp_contato']


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
    """Serializer público — expõe apenas os campos necessários para a página de agendamento."""
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
            raise serializers.ValidationError(
                'O nome do serviço deve ter pelo menos 2 caracteres.'
            )
        return value

    def validate_duracao_min(self, value: int) -> int:
        if value < 5:
            raise serializers.ValidationError(
                'A duração mínima do serviço é de 5 minutos.'
            )
        if value > 480:
            raise serializers.ValidationError(
                'A duração máxima do serviço é de 480 minutos (8 horas).'
            )
        return value

    def validate_preco(self, value) -> object:
        if value < 0:
            raise serializers.ValidationError('O preço não pode ser negativo.')
        return value


# ── Agendamento ───────────────────────────────────────────────────────────────

class AgendamentoSerializer(serializers.ModelSerializer):
    servico_nome = serializers.CharField(source='servico.nome', read_only=True)
    servico_preco = serializers.DecimalField(
        source='servico.preco', max_digits=8, decimal_places=2, read_only=True
    )
    profissional_nome = serializers.CharField(
        source='profissional.nome', read_only=True, default=None
    )

    class Meta:
        model = Agendamento
        fields = [
            'id', 'empresa', 'servico', 'servico_nome', 'servico_preco',
            'profissional', 'profissional_nome',
            'nome_cliente', 'whatsapp_cliente', 'data_hora', 'status',
            'criado_em', 'atualizado_em',
        ]
        read_only_fields = [
            'id', 'empresa', 'servico_nome', 'servico_preco',
            'profissional_nome', 'status', 'criado_em', 'atualizado_em',
        ]

    def validate_nome_cliente(self, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError(
                'Informe seu nome completo (mínimo 2 caracteres).'
            )
        if len(value) > 100:
            raise serializers.ValidationError(
                'O nome não pode ter mais de 100 caracteres.'
            )
        return value

    def validate_whatsapp_cliente(self, value: str) -> str:
        return _validar_telefone_br(value)

    def validate(self, data: dict) -> dict:
        empresa = self.context.get('empresa') or getattr(self.instance, 'empresa', None)
        servico = data.get('servico') or getattr(self.instance, 'servico', None)
        data_hora = data.get('data_hora') or getattr(self.instance, 'data_hora', None)
        profissional = data.get('profissional', getattr(self.instance, 'profissional', None))

        if servico and empresa and servico.empresa_id != empresa.pk:
            raise serializers.ValidationError(
                {'servico': 'O serviço não pertence à empresa informada.'}
            )

        if profissional and empresa and profissional.empresa_id != empresa.pk:
            raise serializers.ValidationError(
                {'profissional': 'O profissional não pertence à empresa informada.'}
            )

        # Agendamento deve ser no futuro (apenas na criação)
        if data_hora and not self.instance:
            if data_hora <= timezone.now():
                raise serializers.ValidationError(
                    {'data_hora': 'O agendamento deve ser para uma data e hora futuras.'}
                )

        if data_hora and servico and empresa:
            self._validar_conflito_horario(empresa, servico, data_hora, profissional)

        return data

    def _validar_conflito_horario(
        self,
        empresa: Empresa,
        servico: Servico,
        data_hora,
        profissional: Profissional | None,
    ) -> None:
        novo_inicio = data_hora
        novo_fim = data_hora + timedelta(minutes=servico.duracao_min)

        qs = (
            Agendamento.objects
            .filter(empresa=empresa, data_hora__lt=novo_fim)
            .exclude(status__in=['cancelado', 'arquivado'])
            .select_related('servico')
        )

        # Conflito por profissional: se há profissional definido, verifica apenas
        # agendamentos do mesmo profissional; caso contrário, verifica empresa inteira.
        if profissional is not None:
            qs = qs.filter(profissional=profissional)
        else:
            qs = qs.filter(profissional__isnull=True)

        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        for ag in qs:
            existente_fim = ag.data_hora + timedelta(minutes=ag.servico.duracao_min)
            if existente_fim > novo_inicio:
                raise serializers.ValidationError({
                    'data_hora': (
                        f'Horário indisponível. Já existe um agendamento de '
                        f'{ag.data_hora.strftime("%H:%M")} até '
                        f'{existente_fim.strftime("%H:%M")}.'
                    )
                })


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
            raise serializers.ValidationError(
                'O intervalo mínimo entre slots é de 5 minutos.'
            )
        if value > 240:
            raise serializers.ValidationError(
                'O intervalo máximo entre slots é de 240 minutos (4 horas).'
            )
        return value

    def validate(self, data: dict) -> dict:
        hora_inicio = data.get('hora_inicio') or getattr(self.instance, 'hora_inicio', None)
        hora_fim = data.get('hora_fim') or getattr(self.instance, 'hora_fim', None)
        if hora_inicio and hora_fim and hora_inicio >= hora_fim:
            raise serializers.ValidationError(
                {'hora_fim': 'Hora fim deve ser posterior à hora início.'}
            )

        # Unicidade (empresa, profissional, dia_semana) aplicada aqui porque
        # MySQL não garante unicidade de colunas com NULL em unique index.
        empresa = self.context.get('empresa') or getattr(self.instance, 'empresa', None)
        profissional = data.get('profissional', getattr(self.instance, 'profissional', None))
        dia_semana = data.get('dia_semana') or getattr(self.instance, 'dia_semana', None)

        if empresa and dia_semana is not None:
            qs = HorarioFuncionamento.objects.filter(
                empresa=empresa,
                dia_semana=dia_semana,
            )
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
                        f'Já existe um horário cadastrado para {quem} '
                        f'neste dia da semana.'
                    )
                })

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
            raise serializers.ValidationError(
                'O nome de usuário deve ter pelo menos 3 caracteres.'
            )
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
            raise serializers.ValidationError(
                'O nome da empresa deve ter pelo menos 2 caracteres.'
            )
        return value

    def validate_slug(self, value: str) -> str:
        if len(value) < 3:
            raise serializers.ValidationError(
                'O link público deve ter pelo menos 3 caracteres.'
            )
        if Empresa.objects.filter(slug=value).exists():
            raise serializers.ValidationError('Este slug já está em uso.')
        return value

    def validate_whatsapp_contato(self, value: str) -> str:
        return _validar_telefone_br(value)

    def validate(self, data: dict) -> dict:
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'As senhas não conferem.'})
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
