import json
import logging
import time
import uuid
from contextvars import ContextVar

request_id_var = ContextVar("request_id", default="")


class JSONFormatter(logging.Formatter):
    def format(self, record):
        # An allowlist avoids accidental authorization/body/exception leakage.
        return json.dumps(
            {
                "level": record.levelname,
                "logger": record.name,
                "event": record.msg if record.name.startswith("marketplace.") else "framework_log",
                "request_id": request_id_var.get(),
                **{
                    k: getattr(record, k)
                    for k in ("status", "duration_ms", "error_type")
                    if hasattr(record, k)
                },
            },
            ensure_ascii=False,
        )


class RequestContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = str(uuid.uuid4())
        token = request_id_var.set(request.request_id)
        started = time.monotonic()
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = request.request_id
            response["Cache-Control"] = "no-store"
            logging.getLogger(__name__).info(
                "http_request",
                extra={
                    "status": response.status_code,
                    "duration_ms": round((time.monotonic() - started) * 1000),
                },
            )
            return response
        finally:
            request_id_var.reset(token)
