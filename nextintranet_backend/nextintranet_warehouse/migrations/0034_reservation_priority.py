from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0033_document_is_primary'),
    ]

    operations = [
        migrations.AddField(
            model_name='reservation',
            name='priority',
            field=models.PositiveSmallIntegerField(
                default=3,
                validators=[
                    django.core.validators.MinValueValidator(1),
                    django.core.validators.MaxValueValidator(5),
                ],
                verbose_name='Priority',
            ),
        ),
    ]
