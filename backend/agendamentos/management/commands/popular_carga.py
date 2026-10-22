"""
Management command: popular_carga
Uso: python manage.py popular_carga [--empresas N] [--historico N]

Cria dados sintéticos para teste de carga: N empresas (slug carga-1..N, dono
dono_carga_1..N, senha "Carga-123!"), cada uma com serviços, profissionais,
grade semanal e um histórico de agendamentos distribuído nos últimos 6 meses
e nas próximas semanas. Idempotente: apaga e recria as empresas "carga-*".

Cria donos com senha conhecida: com DEBUG desligado (produção) só roda com --forcar,
para uso em simulações locais e testes de carga. Nunca rode em produção real.
"""
import random
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from agendamentos.models import (
    Agendamento, AgendamentoServico, Empresa, HorarioFuncionamento, Profissional, Servico,
)

SENHA = 'Carga-123!'
SERVICOS = [
    ('Corte masculino', 30, '40.00'), ('Barba', 20, '25.00'), ('Corte + barba', 50, '60.00'),
    ('Pigmentação', 40, '45.00'), ('Sobrancelha', 10, '15.00'), ('Hidratação', 30, '50.00'),
    ('Luzes', 90, '120.00'), ('Corte infantil', 25, '30.00'),
]
NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Hugo', 'Iara', 'João']


class Command(BaseCommand):
    help = 'Popula o banco com empresas e agendamentos sintéticos para teste de carga.'

    def add_arguments(self, parser):
        parser.add_argument('--empresas', type=int, default=10)
        parser.add_argument('--historico', type=int, default=1500,
                            help='Agendamentos por empresa (padrão 1500).')
        parser.add_argument('--forcar', action='store_true',
                            help='Roda mesmo com DEBUG desligado (simulação local / teste de carga).')

    @transaction.atomic
    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts['forcar']:
            raise CommandError('DEBUG desligado: popular_carga cria donos com senha conhecida. '
                               'Use --forcar só em simulação local ou teste de carga.')
        rnd = random.Random(42)
        # Agendamentos protegem os serviços (on_delete=PROTECT): apagar antes das empresas
        Agendamento.objects.filter(empresa__owner__username__startswith='dono_carga_').delete()
        User.objects.filter(username__startswith='dono_carga_').delete()

        for i in range(1, opts['empresas'] + 1):
            user = User.objects.create_user(f'dono_carga_{i}', f'carga{i}@teste.com', SENHA)
            emp = Empresa.objects.create(
                owner=user, nome_fantasia=f'Barbearia Carga {i}', slug=f'carga-{i}',
                whatsapp_contato='85999990000',
            )
            servicos = [
                Servico.objects.create(empresa=emp, nome=n, duracao_min=d, preco=Decimal(p),
                                       descricao=f'Descrição completa do serviço {n}.')
                for n, d, p in SERVICOS
            ]
            profs = [Profissional.objects.create(empresa=emp, nome=n) for n in NOMES[:3]]
            HorarioFuncionamento.objects.bulk_create([
                HorarioFuncionamento(empresa=emp, profissional=None, dia_semana=d,
                                     hora_inicio=time(8), hora_fim=time(20), intervalo_min=30)
                for d in range(7)
            ])

            hoje = timezone.localdate()
            ags, links = [], []
            for _ in range(opts['historico']):
                dia = hoje + timedelta(days=rnd.randint(-180, 30))
                dt = timezone.make_aware(datetime.combine(dia, time(rnd.randint(8, 18), rnd.choice([0, 30]))))
                escolhidos = rnd.sample(servicos, rnd.randint(1, 3))
                status = 'pendente' if dia >= hoje else rnd.choice(['confirmado'] * 4 + ['cancelado'])
                ags.append((Agendamento(
                    empresa=emp, servico=escolhidos[0], profissional=rnd.choice(profs + [None]),
                    nome_cliente=f'Cliente {rnd.randint(1, 9999)}', whatsapp_cliente='85988887777',
                    data_hora=dt, status=status,
                    duracao_total_min=sum(s.duracao_min for s in escolhidos),
                    preco_total=sum(s.preco for s in escolhidos),
                ), escolhidos))
            Agendamento.objects.bulk_create([a for a, _ in ags], batch_size=500)
            for ag, escolhidos in ags:
                links += [AgendamentoServico(agendamento=ag, servico=s, ordem=o, preco=s.preco)
                          for o, s in enumerate(escolhidos)]
            AgendamentoServico.objects.bulk_create(links, batch_size=1000)
            self.stdout.write(f'  {emp.slug}: {len(ags)} agendamentos')

        self.stdout.write(self.style.SUCCESS(f'Pronto. Login: dono_carga_N / {SENHA}'))
