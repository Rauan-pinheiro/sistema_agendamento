"""
Camada de serviço: lógica de negócio desacoplada das Views.
Todas as funções recebem um objeto `Empresa` e operam exclusivamente
nos dados daquele tenant — nunca expõem dados cross-tenant.
"""
from decimal import Decimal, ROUND_HALF_UP
from django.db.models import Sum, Count
from django.utils import timezone

from .models import Agendamento, Empresa


def calcular_resumo_financeiro(empresa: Empresa) -> dict:
    """
    Retorna métricas do mês corrente para a empresa informada.

    Isolamento: o filtro `empresa=empresa` garante que a query
    nunca toca registros de outros tenants.

    Retorno:
        mes_referencia         — "YYYY-MM"
        agendamentos_confirmados — int
        receita_bruta          — str (decimal com 2 casas, ex: "1250.00")
        ticket_medio           — str (decimal com 2 casas)
    """
    agora = timezone.now()
    inicio_mes = agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    resultado = (
        Agendamento.objects
        .filter(
            empresa=empresa,
            status='confirmado',
            data_hora__gte=inicio_mes,
            data_hora__lte=agora,
        )
        .aggregate(
            agendamentos_confirmados=Count('id'),
            receita_bruta=Sum('servico__preco'),
        )
    )

    count: int = resultado['agendamentos_confirmados'] or 0
    receita: Decimal = resultado['receita_bruta'] or Decimal('0.00')
    ticket_medio: Decimal = (
        (receita / count).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if count > 0
        else Decimal('0.00')
    )

    return {
        'mes_referencia': inicio_mes.strftime('%Y-%m'),
        'agendamentos_confirmados': count,
        'receita_bruta': str(receita.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
        'ticket_medio': str(ticket_medio),
    }
