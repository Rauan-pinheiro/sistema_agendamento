from django.db import models
from django.contrib.auth.models import User


class Empresa(models.Model):
    owner = models.OneToOneField(User, on_delete=models.CASCADE)
    nome_fantasia = models.CharField(max_length=150)
    slug = models.SlugField(unique=True)
    whatsapp_contato = models.CharField(max_length=20)

    def __str__(self) -> str:
        return self.nome_fantasia


class BaseModel(models.Model):
    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Profissional(BaseModel):
    """
    Profissional vinculado a uma Empresa.
    Pode ter grade de horários própria (HorarioFuncionamento.profissional != None)
    ou herdar a grade geral da empresa (HorarioFuncionamento.profissional == None).
    """
    nome = models.CharField(max_length=100)
    especialidade = models.CharField(max_length=100, blank=True)
    ativo = models.BooleanField(default=True)

    class Meta:
        ordering = ['nome']

    def __str__(self) -> str:
        return f"{self.nome} — {self.empresa.nome_fantasia}"


class Servico(BaseModel):
    nome = models.CharField(max_length=100)
    descricao = models.TextField(blank=True)
    duracao_min = models.PositiveIntegerField()
    preco = models.DecimalField(max_digits=8, decimal_places=2)

    def __str__(self) -> str:
        return f"{self.nome} - {self.empresa.nome_fantasia}"


class Agendamento(BaseModel):
    STATUS_CHOICES = [
        ('pendente',   'Pendente'),
        ('confirmado', 'Confirmado'),
        ('cancelado',  'Cancelado'),
        ('arquivado',  'Arquivado'),
    ]

    servico = models.ForeignKey(Servico, on_delete=models.PROTECT)
    # Nullable: None = nenhum profissional específico (empresa genérica)
    profissional = models.ForeignKey(
        Profissional,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='agendamentos',
    )
    nome_cliente = models.CharField(max_length=100)
    whatsapp_cliente = models.CharField(max_length=20)
    data_hora = models.DateTimeField()
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pendente',
    )

    def __str__(self) -> str:
        return f"{self.nome_cliente} - {self.data_hora}"


class HorarioFuncionamento(BaseModel):
    DIA_SEMANA_CHOICES = [
        (0, 'Segunda-feira'),
        (1, 'Terça-feira'),
        (2, 'Quarta-feira'),
        (3, 'Quinta-feira'),
        (4, 'Sexta-feira'),
        (5, 'Sábado'),
        (6, 'Domingo'),
    ]
    # Nullable: None = grade geral da empresa; preenchido = grade individual do profissional
    profissional = models.ForeignKey(
        Profissional,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='horarios',
    )
    dia_semana = models.IntegerField(choices=DIA_SEMANA_CHOICES)
    hora_inicio = models.TimeField()
    hora_fim = models.TimeField()
    intervalo_min = models.PositiveIntegerField(default=30)

    # unique_together removido do DB: MySQL trata NULL != NULL em unique index,
    # permitindo múltiplas grades genéricas. A unicidade é garantida no serializer.
    class Meta:
        ordering = ['profissional', 'dia_semana', 'hora_inicio']

    def __str__(self) -> str:
        quem = self.profissional.nome if self.profissional_id else 'Empresa'
        return f"{quem} — {self.get_dia_semana_display()} ({self.hora_inicio}–{self.hora_fim})"
