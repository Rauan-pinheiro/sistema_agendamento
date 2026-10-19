"""
Camada de serviço: lógica de negócio desacoplada das Views.
Todas as funções recebem um objeto `Empresa` e operam exclusivamente
nos dados daquele tenant — nunca expõem dados cross-tenant.
"""
from collections import Counter
from datetime import datetime, date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db.models import Count, Q, Sum
from django.db.models.functions import ExtractHour, ExtractIsoWeekDay, TruncDate
from django.utils import timezone

from .models import Agendamento, Empresa, HorarioFuncionamento, Profissional


def chave_cache_pagina_publica(slug: str) -> str:
    return f'pagina-publica:{slug}'


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

    # Uma única query para todos os contadores e a receita
    agg = qs.aggregate(
        total=Count('id'),
        confirmados=Count('id', filter=Q(status='confirmado')),
        cancelados=Count('id', filter=Q(status='cancelado')),
        pendentes=Count('id', filter=Q(status='pendente')),
        receita=Sum('preco_total', filter=Q(status='confirmado')),
    )
    total      = agg['total']
    count      = agg['confirmados']
    cancelados = agg['cancelados']
    pendentes  = agg['pendentes']
    receita    = agg['receita'] or Decimal('0.00')

    confirmados_qs = qs.filter(status='confirmado')

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
    Retorna o volume total de agendamentos agrupado por dia da semana e por hora do dia
    (no fuso local). Exclui arquivados. A agregação é feita no banco — no máximo
    7 × 24 linhas trafegam, independentemente do tamanho do histórico.

    Retorno:
        por_dia_semana — list[{dia: str, total: int}]  0=Seg...6=Dom
        por_hora       — list[{hora: int, total: int}]
    """
    DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
    local_tz = timezone.get_current_timezone()

    linhas = (
        Agendamento.objects
        .filter(empresa=empresa)
        .exclude(status='arquivado')
        .annotate(
            dia_iso=ExtractIsoWeekDay('data_hora', tzinfo=local_tz),  # 1=Seg ... 7=Dom
            hora=ExtractHour('data_hora', tzinfo=local_tz),
        )
        .values('dia_iso', 'hora')
        .annotate(total=Count('id'))
        .order_by()
    )

    dia_counter: Counter = Counter()
    hora_counter: Counter = Counter()
    for linha in linhas:
        dia_counter[linha['dia_iso'] - 1] += linha['total']
        hora_counter[linha['hora']] += linha['total']

    por_dia_semana = [{'dia': DIAS[i], 'total': dia_counter[i]} for i in range(7)]
    por_hora = [
        {'hora': h, 'total': hora_counter[h]}
        for h in sorted(hora_counter)
    ]

    return {
        'por_dia_semana': por_dia_semana,
        'por_hora': por_hora,
    }


# ── Regras de reserva (fonte única para API pública, painel e horários disponíveis) ──

def resolver_grade(
    empresa: Empresa, dia_semana: int, profissional: Profissional | None,
) -> HorarioFuncionamento | None:
    """Grade do dia: a do profissional, se ele tiver uma; senão a geral da empresa."""
    if profissional is not None:
        grade = HorarioFuncionamento.objects.filter(
            empresa=empresa, profissional=profissional, dia_semana=dia_semana,
        ).first()
        if grade is not None:
            return grade
    return HorarioFuncionamento.objects.filter(
        empresa=empresa, profissional__isnull=True, dia_semana=dia_semana,
    ).first()


def erro_fora_da_grade(
    empresa: Empresa, data_hora: datetime, duracao_min: int, profissional: Profissional | None,
) -> str | None:
    """Mensagem de erro se a reserva não cabe no expediente do dia (fuso local); None se cabe."""
    local = timezone.localtime(data_hora)
    max_dias = settings.AGENDAMENTO_MAX_DIAS_ANTECEDENCIA
    if local.date() > timezone.localdate() + timedelta(days=max_dias):
        return f'Só é possível agendar com até {max_dias} dias de antecedência.'
    grade = resolver_grade(empresa, local.weekday(), profissional)
    if grade is None:
        return 'Não há atendimento neste dia. Escolha outra data.'
    inicio = local.replace(tzinfo=None)
    fim = inicio + timedelta(minutes=duracao_min)
    abre = datetime.combine(local.date(), grade.hora_inicio)
    fecha = datetime.combine(local.date(), grade.hora_fim)
    if inicio < abre or fim > fecha:
        return (
            f'Fora do horário de atendimento ({grade.hora_inicio:%H:%M} às {grade.hora_fim:%H:%M}). '
            'Escolha outro horário.'
        )
    return None
