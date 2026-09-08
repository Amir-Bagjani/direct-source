from typing import cast

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError

from marketplace.common.storage import PrivateS3Storage


class Command(BaseCommand):
    help = "Create the private development bucket (local settings only)."

    def handle(self, *args, **options):
        if settings.SETTINGS_MODULE != "config.settings.local":
            raise CommandError("This command is only for local development.")
        storage = cast(PrivateS3Storage, default_storage)
        client = storage.connection.meta.client
        buckets = client.list_buckets()["Buckets"]
        if not any(b["Name"] == storage.bucket_name for b in buckets):
            client.create_bucket(Bucket=storage.bucket_name)
        self.stdout.write("Private development bucket ready; no public policy was added.")
