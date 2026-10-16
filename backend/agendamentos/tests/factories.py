"""Helpers de criação de dados para os testes."""
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone

from agendamentos.models import Empresa, HorarioFuncionamento, Profissional, Servico

SENHA = 'Senha-Forte-123'


def criar_empresa(slug='empresa-a', username=None) -> Empresa:
    user = User.objects.create_user(
        username=username or f'dono_{slug.replace("-", "_")}',
        email=f'{slug}@teste.com',
        password=SENHA,
    )
    return Empresa.objects.create(
        owner=user, nome_fantasia=f'Empresa {slug}', slug=slug, whatsapp_contato='85999990000',
    )


def criar_servico(empresa, nome='Corte', duracao=30, preco='35.00') -> Servico:
    return Servico.objects.create(
        empresa=empresa, nome=nome, duracao_min=duracao, preco=Decimal(preco),
    )


def criar_profissional(empresa, nome='João') -> Profissional:
    return Profissional.objects.create(empresa=empresa, nome=nome)


def criar_grade_semana(empresa, profissional=None, inicio=time(8, 0), fim=time(18, 0), intervalo=30):
    for dia in range(7):
        HorarioFuncionamento.objects.create(
            empresa=empresa, profissional=profissional, dia_semana=dia,
            hora_inicio=inicio, hora_fim=fim, intervalo_min=intervalo,
        )


def amanha_as(hora: int, minuto: int = 0) -> datetime:
    """Datetime aware (fuso local) de amanhã no horário informado."""
    data = timezone.localdate() + timedelta(days=1)
    return timezone.make_aware(datetime.combine(data, time(hora, minuto)))
