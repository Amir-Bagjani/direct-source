from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import ALLOWED_HOSTS, SECRET_KEY, env

if len(SECRET_KEY) < 50 or not ALLOWED_HOSTS:
    raise ImproperlyConfigured("Production requires a strong secret and explicit hosts.")
if not env("S3_ENDPOINT_URL", default="").startswith("https://"):
    raise ImproperlyConfigured("Production object storage must use HTTPS.")
if S3_PUBLIC_ENDPOINT_URL and not S3_PUBLIC_ENDPOINT_URL.startswith("https://"):  # noqa: F405
    raise ImproperlyConfigured("Public storage endpoint must use HTTPS.")
DATABASES["default"]["OPTIONS"]["sslmode"] = "verify-full"  # noqa: F405
DATABASES["default"]["OPTIONS"]["sslrootcert"] = env("POSTGRES_SSL_ROOT_CERT")  # noqa: F405
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
# Only enable at a private ingress that strips client-supplied forwarding headers.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
if not ACCOUNT_LINK_BASE_URL.startswith("https://") or not EMAIL_USE_TLS:  # noqa: F405
    raise ImproperlyConfigured("Production requires HTTPS account links and SMTP TLS.")
