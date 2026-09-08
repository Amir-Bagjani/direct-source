from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from marketplace.accounts.models import User, normalize_mobile
from marketplace.accounts.permissions import require_operator
from marketplace.catalog.models import Category
from marketplace.catalog.services import locked_actor, save_taxonomy


class Command(BaseCommand):
    help = "Create the initial bag and shoe categories; preserve existing taxonomy."

    def add_arguments(self, parser):
        parser.add_argument("mobile")

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            actor = User.objects.get(mobile=normalize_mobile(options["mobile"]))
        except User.DoesNotExist as exc:
            raise CommandError("An existing platform owner/operator is required.") from exc
        actor = locked_actor(actor)
        require_operator(actor)
        for slug, name in [("bags", "کیف"), ("shoes", "کفش")]:
            if not Category.objects.filter(slug=slug).exists():
                save_taxonomy(actor=actor, model=Category, data={"slug": slug, "name": name})
        self.stdout.write(self.style.SUCCESS("Initial categories ready."))
