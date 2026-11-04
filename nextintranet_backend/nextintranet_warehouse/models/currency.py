from django.db import models
from django.utils.translation import gettext_lazy as _


class Currency(models.Model):
    """Currency selectable on purchases, with its exchange rate to the base currency."""

    code = models.CharField(max_length=10, unique=True, verbose_name=_("Code"))
    name = models.CharField(max_length=100, blank=True, verbose_name=_("Name"))
    rate_to_base = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=1,
        verbose_name=_("Rate to base currency"),
        help_text=_("Value of 1 unit of this currency in the base currency."),
    )
    is_base = models.BooleanField(default=False, verbose_name=_("Is base currency"))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_("Updated at"))

    class Meta:
        ordering = ["code"]
        verbose_name = _("Currency")
        verbose_name_plural = _("Currencies")

    def __str__(self):
        return self.code
