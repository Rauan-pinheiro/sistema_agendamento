"""
Camada de serviço: lógica de negócio desacoplada das Views.
Todas as funções recebem um objeto `Empresa` e operam exclusivamente
nos dados daquele tenant — nunca expõem dados cross-tenant.
"""
from collections import Counter
from datetime import datetime, date
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum, Count
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import Agendamento, Empresa


def calcular_resumo_financeiro(empresa: Empresa, mes_ref: date | None = None) -> dict:
    """
    Retorna métricas detalhadas do mês de referência para a empresa informada.

    mes_ref: qualquer objeto `date` dentro do mês desejado.
             Padrão: mês corrente.

    Isolamento: o filtro `empresa=empresa` garante que a query
    nunca toca registros de outros tenants.

    Retorno:
        mes_referencia           — "YYYY-MM"
        total_agendamentos       — int  (pendente + confirmado + cancelado)
        agendamentos_confirmados — int
        agendamentos_cancelados  — int
        agendamentos_pendentes   — int
        receita_bruta            — str decimal 2 casas (apenas confirmados)
        ticket_medio             — str decimal 2 casas
        taxa_confirmacao         — float 0–100 (confirmados / total * 100)
        por_dia     — list[{dia, total, receita}]  para gráfico de barras
        por_servico — list[{servico, total, receita}]  para gráfico de rosca
    """
    ref: date = mes_ref if mes_ref is not None else timezone.now().date()

    local_tz = timezone.get_current_timezone()
    inicio_mes = timezone.make_aware(datetime(ref.year, ref.month, 1), local_tz)
    if ref.month == 12:
        inicio_prox_mes = timezone.make_aware(datetime(ref.year + 1, 1, 1), local_tz)
    else:
        inicio_prox_mes = timezone.make_aware(datetime(ref.year, ref.month + 1, 1), local_tz)

    # Base: todos os agendamentos do mês, excluindo arquivados
    qs = (
        Agendamento.objects
        .filter(empresa=empresa, data_hora__gte=inicio_mes, data_hora__lt=inicio_prox_mes)
        .exclude(status='arquivado')
    )

    total = qs.count()

    confirmados_qs = qs.filter(status='confirmado')
    confirmados_agg = confirmados_qs.aggregate(
        count=Count('id'),
        receita=Sum('preco_total'),
    )
    count   = confirmados_agg['count'] or 0
    receita = confirmados_agg['receita'] or Decimal('0.00')

    cancelados = qs.filter(status='cancelado').count()
    pendentes  = qs.filter(status='pendente').count()

    ticket_medio: Decimal = (
        (receita / count).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if count > 0
        else Decimal('0.00')
    )
    taxa_confirmacao: float = round((count / total * 100), 1) if total > 0 else 0.0

    # Breakdown por dia do mês (para gráfico de barras)
    por_dia = [
        {
            'dia':    str(item['dia']),
            'total':  item['total'],
            'receita': str(
                (item['receita'] or Decimal('0')).quantize(Decimal('0.01'))
            ),
        }
        for item in (
            confirmados_qs
            .annotate(dia=TruncDate('data_hora'))
            .values('dia')
            .annotate(total=Count('id'), receita=Sum('preco_total'))
            .order_by('dia')
        )
    ]

    # Breakdown por serviço (para gráfico de rosca)
    por_servico = [
        {
            'servico': item['servico__nome'] or '—',
            'total':   item['total'],
            'receita': str(
                (item['receita'] or Decimal('0')).quantize(Decimal('0.01'))
            ),
        }
        for item in (
            confirmados_qs
            .values('servico__nome')
            .annotate(total=Count('id'), receita=Sum('preco_total'))
            .order_by('-receita')
        )
    ]

    return {
        'mes_referencia':           inicio_mes.strftime('%Y-%m'),
        'total_agendamentos':       total,
        'agendamentos_confirmados': count,
        'agendamentos_cancelados':  cancelados,
        'agendamentos_pendentes':   pendentes,
        'receita_bruta':            str(receita.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
        'ticket_medio':             str(ticket_medio),
        'taxa_confirmacao':         taxa_confirmacao,
        'por_dia':                  por_dia,
        'por_servico':              por_servico,
    }


def calcular_volume_agendamentos(empresa: Empresa) -> dict:
    """
    Retorna o volume total de agendamentos agrupado por dia da semana e por hora do dia.
    Exclui arquivados. Usa Python para agregação a fim de garantir consistência
    entre SQLite (desenvolvimento) e MySQL (produção).

    Retorno:
        por_dia_semana — list[{dia: str, total: int}]  0=Seg...6=Dom
        por_hora       — list[{hora: int, total: int}]
    """
    DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

    datas = (
        Agendamento.objects
        .filter(empresa=empresa)
        .exclude(status='arquivado')
        .values_list('data_hora', flat=True)
    )

    dia_counter: Counter = Counter()
    hora_counter: Counter = Counter()

    for dt in datas:
        local_dt = timezone.localtime(dt)
        dia_counter[local_dt.weekday()] += 1   # 0=Seg, 6=Dom
        hora_counter[local_dt.hour] += 1

    por_dia_semana = [{'dia': DIAS[i], 'total': dia_counter[i]} for i in range(7)]
    por_hora = [
        {'hora': h, 'total': hora_counter[h]}
        for h in sorted(hora_counter)
    ]

    return {
        'por_dia_semana': por_dia_semana,
        'por_hora': por_hora,
    }
