from .base import *  # noqa: F403

DEBUG = True
# Local MinIO has no external KMS. Production retains mandatory SSE and HTTPS.
STORAGES["default"]["OPTIONS"]["object_parameters"] = {}  # noqa: F405
