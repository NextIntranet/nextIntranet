
import django_tables2 as tables

class NIT_Table(tables.Table):
    class Meta:
        template_name = "django_tables2/bootstrap5-responsive.html"
        attrs = {'class': 'table table-striped table-hover'}