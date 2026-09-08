import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-django-secret-not-for-deployment-" * 2)
os.environ.setdefault("JWT_SIGNING_KEY", "test-only-independent-jwt-signing-key-" * 2)
os.environ.setdefault(
    "DATABASE_URL", "postgres://marketplace:marketplace@127.0.0.1:55432/marketplace"
)

from .base import *  # noqa: E402, F403

ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
