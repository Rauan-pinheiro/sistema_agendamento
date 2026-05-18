from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agendamentos', '0003_v1_1_profissional_arquivado'),
    ]

    operations = [
        migrations.AddField(
            model_name='servico',
            name='descricao',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
    ]
