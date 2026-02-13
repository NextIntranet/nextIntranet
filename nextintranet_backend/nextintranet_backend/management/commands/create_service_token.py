from datetime import timedelta
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from nextintranet_backend.authentication import generate_service_token
from nextintranet_backend.models.printList import PrintList
from nextintranet_backend.models.serviceToken import ServiceToken


class Command(BaseCommand):
    help = "Create a long-lived service token."

    def add_arguments(self, parser):
        parser.add_argument("name", help="Human-friendly token name.")
        parser.add_argument(
            "--scope",
            action="append",
            default=[],
            help="Scope to add (repeatable).",
        )
        parser.add_argument(
            "--print-list",
            action="append",
            default=[],
            help="Allowed print queue UUID (repeatable).",
        )
        parser.add_argument(
            "--expires-in",
            type=int,
            default=None,
            help="Expiration in seconds from now.",
        )

    def handle(self, *args, **options):
        name = options["name"]
        scopes = options["scope"]
        print_list_ids = options["print_list"]
        expires_in = options["expires_in"]

        expires_at = None
        if expires_in:
            expires_at = timezone.now() + timedelta(seconds=expires_in)

        raw_token, prefix, token_hash = generate_service_token()
        while ServiceToken.objects.filter(token_prefix=prefix).exists():
            raw_token, prefix, token_hash = generate_service_token()

        token = ServiceToken.objects.create(
            name=name,
            token_prefix=prefix,
            token_hash=token_hash,
            scopes=scopes,
            expires_at=expires_at,
        )

        if print_list_ids:
            queues = list(PrintList.objects.filter(id__in=print_list_ids))
            if len(queues) != len(print_list_ids):
                raise CommandError("One or more print_list IDs were not found.")
            token.allowed_print_lists.set(queues)

        self.stdout.write(self.style.SUCCESS("Service token created. Copy it now:"))
        self.stdout.write(raw_token)
