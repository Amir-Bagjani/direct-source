"""Real Django HTTP server with a disposable PostgreSQL database, never the user's data.

Run via playwright.registration.config.ts. Requires the backend's locked venv and
PostgreSQL. config.settings.test uses a locmem cache/email and a fast password hasher;
business validation and API handlers are unchanged. No fabricated auth endpoints.
"""

import json
import logging
import os
import shutil
import signal
import sys
import tempfile
import uuid
from pathlib import Path
from wsgiref.simple_server import WSGIRequestHandler, make_server

backend = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(backend))
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.test"
if os.environ.get("E2E_POSTGRES_URL"):
    os.environ["DATABASE_URL"] = os.environ["E2E_POSTGRES_URL"]

if os.environ.get("E2E_CAPTURE_MAIL"):
    os.environ["ACCOUNT_LINK_BASE_URL"] = "http://localhost:3100/account/confirm"

import django  # noqa: E402

django.setup()
logging.getLogger("marketplace.common.middleware").setLevel(logging.WARNING)

from django.core.wsgi import get_wsgi_application  # noqa: E402
from django.db import connection  # noqa: E402


class QuietHandler(WSGIRequestHandler):
    def log_message(self, *_args):
        pass


def stop(*_args):
    raise KeyboardInterrupt


# Never reuse/drop an existing test database or change the running application's DB.
original_name = connection.settings_dict["NAME"]
test_name = os.environ.get("E2E_DATABASE_NAME", f"test_frontend_{uuid.uuid4().hex}")
if not test_name.startswith("test_frontend_") or not test_name.replace("_", "").isalnum():
    raise RuntimeError("Unsafe test database name")
connection.settings_dict["TEST"]["NAME"] = test_name
connection.creation.create_test_db(verbosity=0, autoclobber=False)
mail_dir = Path(tempfile.gettempdir()) / test_name
if os.environ.get("E2E_CAPTURE_MAIL"):
    mail_dir.mkdir(mode=0o700)
application = get_wsgi_application()


def test_application(environ, start_response):
    response = application(environ, start_response)
    if os.environ.get("E2E_CAPTURE_MAIL"):
        from django.core import mail
        from marketplace.operations.tasks import deliver_email_outbox

        deliver_email_outbox()
        temporary = mail_dir / "pending.json"
        temporary.write_text(
            json.dumps(
                [
                    {"body": message.body, "to": message.to}
                    for message in getattr(mail, "outbox", [])
                ]
            )
        )
        temporary.chmod(0o600)
        temporary.replace(mail_dir / "outbox.json")
    return response


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
try:
    with connection.cursor() as cursor:
        cursor.execute((Path(__file__).parent / "session-schema.sql").read_text())
    with make_server("127.0.0.1", 8001, test_application, handler_class=QuietHandler) as server:
        print("Isolated Django registration test server ready on port 8001", flush=True)
        server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    connection.creation.destroy_test_db(original_name, verbosity=0)
    if os.environ.get("E2E_CAPTURE_MAIL"):
        shutil.rmtree(mail_dir)
