from decimal import ROUND_HALF_UP, Decimal

from django.db import migrations, models


def preencher_precos(apps, schema_editor):
    """
    Grava o preço de cada item sem alterar a receita já registrada (`preco_total`).

    O preço da época de cada item não foi guardado: `preco_total` é dividido entre os
    itens na proporção do preço atual dos serviços (o último item absorve o
    arredondamento, então a soma dos itens é sempre igual ao total). Agendamentos
    antigos que só têm a FK `servico` ganham um item com o total inteiro.
    """
    Agendamento = apps.get_model('agendamentos', 'Agendamento')
    Item = apps.get_model('agendamentos', 'AgendamentoServico')
    centavo = Decimal('0.01')

    for ag in Agendamento.objects.only('id', 'servico_id', 'preco_total').iterator():
        itens = list(Item.objects.filter(agendamento_id=ag.id).select_related('servico').order_by('ordem', 'id'))
        if not itens:
            if ag.servico_id:
                Item.objects.create(agendamento_id=ag.id, servico_id=ag.servico_id, ordem=0, preco=ag.preco_total)
            continue

        base = sum((i.servico.preco for i in itens), Decimal('0'))
        restante = ag.preco_total
        for n, item in enumerate(itens):
            if n == len(itens) - 1:
                item.preco = restante
            elif base > 0:
                item.preco = (ag.preco_total * item.servico.preco / base).quantize(centavo, ROUND_HALF_UP)
            else:
                item.preco = (ag.preco_total / len(itens)).quantize(centavo, ROUND_HALF_UP)
            restante -= item.preco
            item.save(update_fields=['preco'])


class Migration(migrations.Migration):

    dependencies = [
        ('agendamentos', '0010_empresa_aceite_termos'),
    ]

    operations = [
        migrations.AddField(
            model_name='agendamentoservico',
            name='preco',
            field=models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=8),
        ),
        migrations.RunPython(preencher_precos, migrations.RunPython.noop),
    ]
