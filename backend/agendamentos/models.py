from django.db import models
from django.contrib.auth.models import User

# O "Tenant" (Inquilino) do seu SaaS
class Empresa(models.Model):
    owner = models.OneToOneField(User, on_delete=models.CASCADE)
    nome_fantasia = models.CharField(max_length=150)
    slug = models.SlugField(unique=True)  # Para o link personalizado: sistema.com/empresa-x
    whatsapp_contato = models.CharField(max_length=20)

    def __str__(self):
        return self.nome_fantasia

class BaseModel(models.Model):
    # O segredo do isolamento: cada registro pertence a uma empresa
    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

class Servico(BaseModel):
    nome = models.CharField(max_length=100)
    duracao_min = models.PositiveIntegerField()
    preco = models.DecimalField(max_digits=8, decimal_places=2)

    def __str__(self):
        return f"{self.nome} - {self.empresa.nome_fantasia}"

class Agendamento(BaseModel):
    STATUS_CHOICES = [
        ('pendente', 'Pendente'),
        ('confirmado', 'Confirmado'),
        ('cancelado', 'Cancelado'),
    ]

    servico = models.ForeignKey(Servico, on_delete=models.PROTECT)
    nome_cliente = models.CharField(max_length=100)
    whatsapp_cliente = models.CharField(max_length=20)
    data_hora = models.DateTimeField()
    status = models.CharField(
        max_length=20, 
        choices=STATUS_CHOICES, 
        default='pendente'
    )

    def __str__(self):
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
    dia_semana = models.IntegerField(choices=DIA_SEMANA_CHOICES)
    hora_inicio = models.TimeField()
    hora_fim = models.TimeField()
    intervalo_min = models.PositiveIntegerField(default=30)

    class Meta:
        ordering = ['dia_semana', 'hora_inicio']
        unique_together = ['empresa', 'dia_semana']

    def __str__(self):
        return f"{self.get_dia_semana_display()} ({self.hora_inicio}–{self.hora_fim})"