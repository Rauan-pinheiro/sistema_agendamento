from rest_framework import serializers
from django.contrib.auth.models import User
from django.db import transaction
from datetime import timedelta
from .models import Empresa, Servico, Agendamento, HorarioFuncionamento


class EmpresaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ['id', 'nome_fantasia', 'slug', 'whatsapp_contato']
        read_only_fields = ['id']


class EmpresaPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ['id', 'nome_fantasia', 'slug', 'whatsapp_contato']


class ServicoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Servico
        fields = ['id', 'empresa', 'nome', 'duracao_min', 'preco', 'criado_em', 'atualizado_em']
        read_only_fields = ['id', 'empresa', 'criado_em', 'atualizado_em']


class AgendamentoSerializer(serializers.ModelSerializer):
    servico_nome = serializers.CharField(source='servico.nome', read_only=True)
    servico_preco = serializers.DecimalField(source='servico.preco', max_digits=8, decimal_places=2, read_only=True)

    class Meta:
        model = Agendamento
        fields = [
            'id', 'empresa', 'servico', 'servico_nome', 'servico_preco', 'nome_cliente',
            'whatsapp_cliente', 'data_hora', 'status',
            'criado_em', 'atualizado_em',
        ]
        read_only_fields = ['id', 'empresa', 'servico_nome', 'servico_preco', 'status', 'criado_em', 'atualizado_em']

    def validate(self, data):
        empresa = self.context.get('empresa') or getattr(self.instance, 'empresa', None)
        servico = data.get('servico') or getattr(self.instance, 'servico', None)
        data_hora = data.get('data_hora') or getattr(self.instance, 'data_hora', None)

        if servico and empresa and servico.empresa_id != empresa.pk:
            raise serializers.ValidationError(
                {'servico': 'O serviço não pertence à empresa informada.'}
            )

        if data_hora and servico and empresa:
            self._validar_conflito_horario(empresa, servico, data_hora)

        return data

    def _validar_conflito_horario(self, empresa, servico, data_hora):
        novo_inicio = data_hora
        novo_fim = data_hora + timedelta(minutes=servico.duracao_min)

        # Busca agendamentos não cancelados da empresa que começam antes do novo terminar
        candidatos = (
            Agendamento.objects
            .filter(empresa=empresa, data_hora__lt=novo_fim)
            .exclude(status='cancelado')
            .select_related('servico')
        )

        # Exclui o próprio agendamento em caso de atualização
        if self.instance:
            candidatos = candidatos.exclude(pk=self.instance.pk)

        for ag in candidatos:
            existente_fim = ag.data_hora + timedelta(minutes=ag.servico.duracao_min)
            if existente_fim > novo_inicio:
                raise serializers.ValidationError({
                    'data_hora': (
                        f'Horário indisponível. Já existe um agendamento de '
                        f'{ag.data_hora.strftime("%H:%M")} até '
                        f'{existente_fim.strftime("%H:%M")}.'
                    )
                })


class HorarioFuncionamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = HorarioFuncionamento
        fields = ['id', 'empresa', 'dia_semana', 'hora_inicio', 'hora_fim', 'intervalo_min', 'criado_em', 'atualizado_em']
        read_only_fields = ['id', 'empresa', 'criado_em', 'atualizado_em']

    def validate(self, data):
        hora_inicio = data.get('hora_inicio') or getattr(self.instance, 'hora_inicio', None)
        hora_fim = data.get('hora_fim') or getattr(self.instance, 'hora_fim', None)
        if hora_inicio and hora_fim and hora_inicio >= hora_fim:
            raise serializers.ValidationError({'hora_fim': 'Hora fim deve ser posterior à hora início.'})
        return data


class RegistroSerializer(serializers.Serializer):
    # Dados do usuário
    username         = serializers.CharField(max_length=150)
    email            = serializers.EmailField()
    password         = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    # Dados da empresa
    nome_fantasia    = serializers.CharField(max_length=150)
    slug             = serializers.SlugField()
    whatsapp_contato = serializers.CharField(max_length=20)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('Este nome de usuário já está em uso.')
        return value

    def validate_slug(self, value):
        if Empresa.objects.filter(slug=value).exists():
            raise serializers.ValidationError('Este slug já está em uso.')
        return value

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'As senhas não conferem.'})
        return data

    def create(self, validated_data):
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
