from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from marketplace.accounts.models import PlatformRole, User, normalize_mobile
from marketplace.operations.services import audit


class Command(BaseCommand):
    help = "Grant the initial platform owner to an existing account, with an audit event."

    def add_arguments(self, parser):
        parser.add_argument("mobile")
        parser.add_argument("--reason", required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(786234901)")
        if PlatformRole.objects.filter(role="owner").exists():
            raise CommandError("Initial owner already configured.")
        if not options["reason"].strip():
            raise CommandError("Reason must not be blank.")
        try:
            user = User.objects.select_for_update().get(
                mobile=normalize_mobile(options["mobile"]), is_active=True, is_suspended=False
            )
        except User.DoesNotExist as exc:
            raise CommandError("Register an active account first.") from exc
        role = PlatformRole.objects.create(user=user, role="owner")
        audit(
            actor=None,
            action="platform.owner_bootstrapped",
            target=role,
            reason=options["reason"],
            after={"user_id": str(user.pk)},
        )
        self.stdout.write(self.style.SUCCESS("Initial platform owner configured."))
