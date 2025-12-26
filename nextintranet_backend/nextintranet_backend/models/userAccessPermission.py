from django.db import models

from .user import User


class UserAccessPermission(models.Model):
    LEVEL_READ = 'read'
    LEVEL_WRITE = 'write'
    LEVEL_ADMIN = 'admin'
    LEVEL_HIDDEN = 'hidden'
    LEVEL_GUEST = 'guest'

    LEVEL_CHOICES = [
        (LEVEL_HIDDEN, 'Hidden'),
        (LEVEL_GUEST, 'Guest'),
        (LEVEL_READ, 'Read'),
        (LEVEL_WRITE, 'Write'),
        (LEVEL_ADMIN, 'Admin'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='access_permissions')
    area = models.CharField(max_length=100)
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default=LEVEL_READ)

    class Meta:
        unique_together = ('user', 'area')
        ordering = ['user_id', 'area']

    def __str__(self):
        return f'{self.user.username} - {self.area}: {self.level}'
