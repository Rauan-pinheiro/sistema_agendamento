from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


def backfill_totais(apps, schema_editor):
    """Popula duracao_total_min e preco_total para agendamentos anteriores à migration."""
    Agendamento = apps.get_model('agendamentos', 'Agendamento')
    for ag in Agendamento.objects.select_related('servico').filter(servico__isnull=False):
        ag.duracao_total_min = ag.servico.duracao_min
        ag.preco_total = ag.servico.preco
        ag.save(update_fields=['duracao_total_min', 'preco_total'])


class Migration(migrations.Migration):

    dependencies = [
        ('agendamentos', '0004_servico_descricao'),
    ]

    operations = [
        # 1. servico passa a ser nullable (compatibilidade com M2M)
        migrations.AlterField(
            model_name='agendamento',
            name='servico',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                to='agendamentos.servico',
            ),
        ),
        # 2. Campos desnormalizados para duração e preço totais
        migrations.AddField(
            model_name='agendamento',
            name='duracao_total_min',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='agendamento',
            name='preco_total',
            field=models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=9),
        ),
        # 3. Backfill dos registros existentes
        migrations.RunPython(backfill_totais, migrations.RunPython.noop),
        # 4. Tabela intermediária M2M
        migrations.CreateModel(
            name='AgendamentoServico',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ordem', models.PositiveSmallIntegerField(default=0)),
                (
                    'agendamento',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='agendamento_servicos',
                        to='agendamentos.agendamento',
                    ),
                ),
                (
                    'servico',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        to='agendamentos.servico',
                    ),
                ),
            ],
            options={
                'ordering': ['ordem'],
                'unique_together': {('agendamento', 'servico')},
            },
        ),
        # 5. Campo M2M no Agendamento
        migrations.AddField(
            model_name='agendamento',
            name='servicos',
            field=models.ManyToManyField(
                blank=True,
                related_name='agendamentos_multi',
                through='agendamentos.AgendamentoServico',
                to='agendamentos.servico',
            ),
        ),
    ]
