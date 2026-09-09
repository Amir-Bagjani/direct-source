from datetime import timedelta
from pathlib import Path
from typing import Any

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent.parent
env = environ.Env()
SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = False
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.admin",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "storages",
    "marketplace.common",
    "marketplace.accounts",
    "marketplace.operations",
    "marketplace.catalog",
    "marketplace.logistics",
]
MIDDLEWARE = [
    "marketplace.common.middleware.RequestContextMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]
DATABASES = {"default": env.db("DATABASE_URL")}
if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
    raise ImproperlyConfigured("PostgreSQL is required; SQLite is not an integration backend.")
DATABASES["default"]["CONN_MAX_AGE"] = 0
DATABASES["default"]["OPTIONS"] = {
    "connect_timeout": 5,
    "options": "-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000",
}
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["marketplace.accounts.backends.ActiveAccountBackend"]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "fa-ir"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])
DATA_UPLOAD_MAX_MEMORY_SIZE = 11 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FILES = 10
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "marketplace.accounts.authentication.SessionJWTAuthentication"
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "marketplace.common.exceptions.exception_handler",
    "DEFAULT_PAGINATION_CLASS": "marketplace.common.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "login": "10/min",
        "register": "5/min",
        "refresh": "60/min",
        "email": "5/hour",
        "upload": "20/hour",
    },
    "NUM_PROXIES": 0,
}
JWT_SIGNING_KEY = env("JWT_SIGNING_KEY")
if JWT_SIGNING_KEY == SECRET_KEY or len(JWT_SIGNING_KEY) < 48:
    raise ImproperlyConfigured("JWT_SIGNING_KEY must be independent and at least 48 characters.")
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=5),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": JWT_SIGNING_KEY,
    "ISSUER": "directsourcing-backend",
    "AUDIENCE": "directsourcing-bff",
    "UPDATE_LAST_LOGIN": False,
}
SPECTACULAR_SETTINGS = {
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "marketplace.common.schema.add_error_contract",
    ],
    "ENUM_NAME_OVERRIDES": {
        "ProductPublicationDecisionEnum": ["published", "changes_requested", "rejected"],
        "ProductRevisionDecisionEnum": ["approved", "changes_requested", "rejected"],
        "BusinessKindEnum": [("manufacturer", "تولیدکننده"), ("retailer", "خرده‌فروش")],
        "VerificationKindEnum": [("identity", "هویت"), ("activity", "فعالیت")],
    },
    "TITLE": "DirectSourcing Backend",
    "VERSION": "1.0.0",
    "DESCRIPTION": "Implemented backend contracts; monetary fields use integer IRR and times use UTC.",
    "COMPONENT_SPLIT_REQUEST": True,
    "SERVE_INCLUDE_SCHEMA": False,
    "SERVE_PERMISSIONS": ["rest_framework.permissions.IsAdminUser"],
    "SERVE_AUTHENTICATION": ["marketplace.accounts.authentication.SessionJWTAuthentication"],
}
REDIS_URL = env("REDIS_URL", default="redis://127.0.0.1:6379/0")
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL}
}
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://127.0.0.1:6379/1")
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_IGNORE_RESULT = True
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_TASK_SOFT_TIME_LIMIT = 25
CELERY_TASK_TIME_LIMIT = 30
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_TIMEZONE = "UTC"
CELERY_BEAT_SCHEDULE = {
    "deliver-internal-outbox": {"task": "operations.deliver_outbox", "schedule": 10.0},
    "deliver-email-outbox": {"task": "operations.deliver_email_outbox", "schedule": 10.0},
}
TERMS_VERSION = "2026-09-07"
PRIVACY_VERSION = "2026-09-07"
DOCUMENT_CONSENT_VERSION = "2026-09-07"
CLAMAV_HOST = env("CLAMAV_HOST", default="127.0.0.1")
CLAMAV_PORT = env.int("CLAMAV_PORT", default=3310)
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST", default="127.0.0.1")
EMAIL_PORT = env.int("EMAIL_PORT", default=1025)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=False)
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="accounts@localhost")
ACCOUNT_LINK_BASE_URL = env(
    "ACCOUNT_LINK_BASE_URL", default="http://localhost:3000/account/confirm"
)
S3_PUBLIC_ENDPOINT_URL = env("S3_PUBLIC_ENDPOINT_URL", default="")
STORAGES: dict[str, dict[str, Any]] = {
    "default": {
        "BACKEND": "marketplace.common.storage.PrivateS3Storage",
        "OPTIONS": {
            "bucket_name": env("S3_BUCKET", default="marketplace-private"),
            "endpoint_url": env("S3_ENDPOINT_URL", default="http://127.0.0.1:9000"),
            "access_key": env("S3_ACCESS_KEY", default=""),
            "secret_key": env("S3_SECRET_KEY", default=""),
            "region_name": env("S3_REGION", default="us-east-1"),
            "default_acl": "private",
            "querystring_auth": True,
            "querystring_expire": 60,
            "file_overwrite": False,
            "signature_version": "s3v4",
            "object_parameters": {"ServerSideEncryption": "AES256"},
        },
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.ManifestStaticFilesStorage"},
}
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"json": {"()": "marketplace.common.middleware.JSONFormatter"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "json"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
