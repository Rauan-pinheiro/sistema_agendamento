from rest_framework import serializers
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
