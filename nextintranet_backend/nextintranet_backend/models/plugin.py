import uuid
from django.db import models
from django.conf import settings
from django.contrib.auth.models import Group


class PluginInstance(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    definition_key = models.CharField(max_length=150)
    name = models.CharField(max_length=255)
    enabled = models.BooleanField(default=True)
    config = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_plugin_instances",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    roles = models.ManyToManyField(
        Group,
        through="PluginInstanceRole",
        related_name="plugin_instances",
        blank=True,
    )

    def __str__(self):
        return f"{self.definition_key} - {self.name}"


class PluginInstanceRole(models.Model):
    instance = models.ForeignKey(PluginInstance, on_delete=models.CASCADE)
    role = models.ForeignKey(Group, on_delete=models.CASCADE)

    class Meta:
        unique_together = ("instance", "role")

    def __str__(self):
        return f"{self.instance.definition_key}:{self.instance.name} -> {self.role.name}"
