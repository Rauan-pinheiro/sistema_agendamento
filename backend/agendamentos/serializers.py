from rest_framework import serializers
from django.contrib.auth.models import User
from django.db import transaction
from .models import Empresa, Servico, Agendamento


class EmpresaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ['id', 'nome_fantasia', 'slug', 'whatsapp_contato']
        read_only_fields = ['id']


class ServicoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Servico
        fields = ['id', 'empresa', 'nome', 'duracao_min', 'preco', 'criado_em', 'atualizado_em']
        read_only_fields = ['id', 'empresa', 'criado_em', 'atualizado_em']


class AgendamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agendamento
        fields = [
            'id', 'empresa', 'servico', 'nome_cliente',
            'whatsapp_cliente', 'data_hora', 'status',
            'criado_em', 'atualizado_em',
        ]
        read_only_fields = ['id', 'empresa', 'status', 'criado_em', 'atualizado_em']

    def validate(self, data):
        # empresa vem do contexto injetado pela view, não do payload
        empresa = self.context.get('empresa') or getattr(self.instance, 'empresa', None)
        servico = data.get('servico') or getattr(self.instance, 'servico', None)

        if servico and empresa and servico.empresa_id != empresa.pk:
            raise serializers.ValidationError(
                {'servico': 'O serviço não pertence à empresa informada.'}
            )

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
