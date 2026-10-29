"""
Modo demonstração: duas empresas de exemplo para ver e mostrar a interface.

    MIDIA_PROVEDOR=local python manage.py popular_demo

- demo-studio-lume       salão COM todas as fotos (capa, logo, serviços e equipe)
- demo-canto-do-corte    barbearia SEM nenhuma foto (mostra os fallbacks da vitrine)

As fotos de exemplo (Unsplash, licença livre) ficam em docs/design/comum/fotos/ e só entram aqui:
são copiadas para o armazenamento LOCAL de mídia (midia_local.py). Nunca vão para o bundle do app
nem para o Cloudinary de produção. Login dos donos: demo_lume / demo_canto, senha Demo-123!.
"""
import random
import shutil
from datetime import datetime, time, timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from agendamentos import midia
from agendamentos.models import (
    Agendamento, AgendamentoServico, Empresa, HorarioFuncionamento, MidiaServico, Profissional, Servico,
)

SENHA = 'Demo-123!'
FOTOS = Path(settings.BASE_DIR).parent / 'docs' / 'design' / 'comum' / 'fotos'
CLIENTES = ['Ana Beatriz', 'Rafael Sousa', 'Thiago Lima', 'Marina Costa', 'Pedro Henrique', 'Lucas Andrade',
            'Larissa Melo', 'João Victor', 'Felipe Rocha', 'Gabriela Matos', 'Bruno Alves', 'Camila Freitas',
            'Diego Nunes', 'Íris Bezerra', 'Renata Castro', 'Caio Monteiro']

EMPRESAS = [
    {
        'usuario': 'demo_lume', 'nome': 'Studio Lume', 'slug': 'demo-studio-lume', 'cor': '#7A2238',
        'fotos': True, 'capa': 'capa-salao',
        'servicos': [
            ('Escova modelada', 45, '60', 'escova', 'Lavagem, escova e finalização com protetor térmico.'),
            ('Corte feminino', 60, '90', 'corte-feminino', 'Conversa antes do corte, lavagem e escova simples.'),
            ('Mechas e iluminado', 180, '380', 'mechas', 'O valor final depende do comprimento. Inclui tonalização.'),
            ('Hidratação profunda', 50, '80', 'hidratacao', 'Máscara de tratamento com vapor e massagem.'),
            ('Manicure e pedicure', 75, '65', 'unhas', 'Cutilagem, esmaltação e hidratação dos pés.'),
            ('Finalização de cachos', 60, '110', 'cachos', 'Lavagem, fitagem e difusor para cachos definidos.'),
        ],
        'equipe': [('Carla Menezes', 'Cabelo e corte', 'carla'), ('Juliana Pires', 'Unhas', 'juliana'),
                   ('Priscila Rocha', 'Coloração', 'priscila')],
    },
    {
        'usuario': 'demo_canto', 'nome': 'Barbearia Canto do Corte', 'slug': 'demo-canto-do-corte', 'cor': '#1F4E8C',
        'fotos': False,
        'servicos': [
            ('Corte masculino', 40, '45', None, 'Tesoura e máquina, com lavagem e finalização.'),
            ('Corte + barba', 60, '70', None, 'O combo da casa: sai R$ 10 mais barato que separado.'),
            ('Barba com toalha quente', 30, '35', None, 'Navalha, toalha quente e balm no final.'),
            ('Pezinho e desenho', 20, '20', None, 'Acabamento na navalha e desenho simples.'),
            ('Hidratação de barba', 20, '30', None, 'Óleo e balm para a barba ficar macia.'),
        ],
        'equipe': [('Zé Ricardo', 'Barbeiro e dono', None), ('Davi Holanda', 'Barbeiro', None),
                   ('Márcio Lima', 'Barbeiro', None)],
    },
]


def _copiar_foto(nome: str, pasta: str) -> tuple[str, int]:
    """Copia a foto de exemplo para o armazenamento local, já como pública. Devolve (public_id, bytes)."""
    origem = FOTOS / f'{nome}.webp'
    public_id = f'{pasta}/demo{nome.replace("-", "")[:12]:x<12}'
    destino = Path(settings.MIDIA_LOCAL_DIR) / midia.ENTREGA_PUBLICA / f'{public_id}.webp'
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(origem, destino)
    return public_id, origem.stat().st_size


class Command(BaseCommand):
    help = 'Cria as empresas do modo demonstração (uma com todas as fotos e outra sem nenhuma).'

    def add_arguments(self, parser):
        parser.add_argument('--forcar', action='store_true',
                            help='Permite rodar com DEBUG desligado (só simulação local).')

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts['forcar']:
            raise CommandError('DEBUG desligado: popular_demo cria donos com senha conhecida.')
        if settings.MIDIA_PROVEDOR != 'local':
            raise CommandError('Use MIDIA_PROVEDOR=local: as fotos de exemplo nunca vão para o Cloudinary.')
        if not FOTOS.is_dir():
            raise CommandError(f'Fotos de exemplo não encontradas em {FOTOS}.')
        rnd = random.Random(29)
        usuarios = [e['usuario'] for e in EMPRESAS]
        Agendamento.objects.filter(empresa__owner__username__in=usuarios).delete()
        User.objects.filter(username__in=usuarios).delete()
        for dados in EMPRESAS:
            with transaction.atomic():
                emp = self._empresa(dados, rnd)
            self.stdout.write(f'  /{emp.slug}  (login {dados["usuario"]} / {SENHA})')
        self.stdout.write(self.style.SUCCESS('Modo demonstração pronto.'))

    def _empresa(self, d: dict, rnd: random.Random) -> Empresa:
        user = User.objects.create_user(d['usuario'], f'{d["usuario"]}@demo.local', SENHA, first_name=d['nome'])
        emp = Empresa.objects.create(owner=user, nome_fantasia=d['nome'], slug=d['slug'],
                                     whatsapp_contato='85999990000', cor_destaque=d['cor'])
        if d['fotos']:
            emp.capa_public_id, _ = _copiar_foto(d['capa'], midia.pasta_da_empresa(emp.pk))
            emp.save(update_fields=['capa_public_id'])

        servicos = []
        for nome, dur, preco, foto, desc in d['servicos']:
            s = Servico.objects.create(empresa=emp, nome=nome, duracao_min=dur, preco=Decimal(preco), descricao=desc)
            if foto:
                public_id, tamanho = _copiar_foto(foto, midia.pasta_do_servico(emp.pk, s.pk))
                MidiaServico.objects.create(empresa=emp, servico=s, tipo='imagem', public_id=public_id,
                                            formato='webp', bytes=tamanho, largura=800, altura=800, ordem=1)
            servicos.append(s)

        equipe = []
        for nome, papel, foto in d['equipe']:
            p = Profissional.objects.create(empresa=emp, nome=nome, especialidade=papel)
            if foto:
                p.foto_public_id, _ = _copiar_foto(foto, midia.pasta_do_profissional(emp.pk, p.pk))
                p.save(update_fields=['foto_public_id'])
            equipe.append(p)

        # Segunda a sábado, 8h às 20h; domingo fechado
        HorarioFuncionamento.objects.bulk_create([
            HorarioFuncionamento(empresa=emp, profissional=None, dia_semana=dia,
                                 hora_inicio=time(8), hora_fim=time(20), intervalo_min=30)
            for dia in range(6)
        ])
        self._agenda(emp, servicos, equipe, rnd)
        return emp

    def _agenda(self, emp, servicos, equipe, rnd):
        """30 dias de histórico, hoje cheio e a próxima semana com pedidos a confirmar."""
        hoje = timezone.localdate()
        agora = timezone.localtime()
        ags = []
        for delta in range(-30, 8):
            dia = hoje + timedelta(days=delta)
            if dia.weekday() == 6:
                continue
            for pro in equipe:
                minuto = 9 * 60 + rnd.choice([0, 30])
                while minuto < 18 * 60:
                    escolhidos = rnd.sample(servicos, 2 if rnd.random() < .2 else 1)
                    dur = sum(s.duracao_min for s in escolhidos)
                    if delta != 0 and rnd.random() < .45:  # dias comuns menos cheios que hoje
                        minuto += 60
                        continue
                    dt = timezone.make_aware(datetime.combine(dia, time(minuto // 60, minuto % 60)))
                    if dt < agora:
                        status = 'cancelado' if rnd.random() < .06 else 'confirmado'
                    else:
                        status = 'pendente' if rnd.random() < .3 else 'confirmado'
                    ags.append((Agendamento(
                        empresa=emp, servico=escolhidos[0], profissional=pro,
                        nome_cliente=rnd.choice(CLIENTES), whatsapp_cliente=f'8598{rnd.randint(1000000, 9999999)}',
                        data_hora=dt, status=status, duracao_total_min=dur,
                        preco_total=sum(s.preco for s in escolhidos),
                    ), escolhidos))
                    minuto += dur + rnd.choice([0, 10, 30, 60])
                    minuto = (minuto + 9) // 10 * 10
        Agendamento.objects.bulk_create([a for a, _ in ags], batch_size=500)
        AgendamentoServico.objects.bulk_create([
            AgendamentoServico(agendamento=a, servico=s, ordem=o, preco=s.preco)
            for a, escolhidos in ags for o, s in enumerate(escolhidos)
        ], batch_size=1000)
