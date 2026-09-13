from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from marketplace.accounts.models import User
from marketplace.accounts.permissions import require_owner
from marketplace.operations.models import StoredFile
from marketplace.operations.retention import erase_object
from marketplace.operations.services import audit


class Command(BaseCommand):
    help = "Reapply approved file deletions after restoring a private storage backup."

    def add_arguments(self, parser):
        parser.add_argument("--actor", required=True, type=str)
        parser.add_argument("--reason", required=True, type=str)

    def handle(self, *args, **options):
        actor = User.objects.filter(pk=options["actor"]).first()
        if not actor or not options["reason"].strip():
            raise CommandError("An active platform owner and a reason are required.")
        require_owner(actor)
        count = 0
        for file in StoredFile.objects.filter(deleted_at__isnull=False).iterator():
            try:
                erase_object(file)
            except Exception:
                raise CommandError(
                    "Storage purge failed; access must remain closed until retry succeeds."
                ) from None
            with transaction.atomic():
                audit(
                    actor=actor,
                    target=file,
                    action="file.tombstone_reapplied",
                    reason=options["reason"],
                )
            count += 1
        self.stdout.write(f"Reapplied {count} approved tombstones.")
