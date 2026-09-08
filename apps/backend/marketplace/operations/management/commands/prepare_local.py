"""Bounded provider readiness and initialization for the local launcher."""

import smtplib
import socket
import time

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from redis import Redis


class Command(BaseCommand):
    help = "Wait for local providers, migrate, and create the private storage bucket."

    def handle(self, *args, **options):
        if settings.SETTINGS_MODULE != "config.settings.local":
            raise CommandError("This command is only for local development.")
        deadline = time.monotonic() + 600
        while True:
            try:
                connection.ensure_connection()
                Redis.from_url(settings.CELERY_BROKER_URL, socket_timeout=3).ping()
                with smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT, timeout=3) as smtp:
                    smtp.noop()
                with socket.create_connection(
                    (settings.CLAMAV_HOST, settings.CLAMAV_PORT), timeout=3
                ) as scanner:
                    scanner.sendall(b"zPING\0")
                    if scanner.recv(64).rstrip(b"\0\n") != b"PONG":
                        raise OSError("ClamAV is not ready")
                call_command("init_local_storage", stdout=self.stdout)
                break
            except Exception as exc:
                if time.monotonic() >= deadline:
                    raise CommandError(
                        "Local providers did not become ready within 10 minutes."
                    ) from exc
                self.stdout.write(f"Waiting for local providers ({type(exc).__name__})...")
                time.sleep(5)
        call_command("migrate", interactive=False, stdout=self.stdout)
        self.stdout.write(self.style.SUCCESS("Local backend initialization complete."))
