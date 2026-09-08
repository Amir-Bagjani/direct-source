from django.core.exceptions import RequestDataTooBig, TooManyFilesSent
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_handler


class Conflict(APIException):
    status_code = 409
    default_detail = "وضعیت جاری با این عملیات سازگار نیست."
    default_code = "conflict"


class PayloadTooLarge(APIException):
    status_code = 413
    default_detail = "حجم یا تعداد فایل‌های درخواست بیش از حد مجاز است."
    default_code = "payload_too_large"


def exception_handler(exc, context):
    if isinstance(exc, (RequestDataTooBig, TooManyFilesSent)):
        exc = PayloadTooLarge()
    if isinstance(exc, DjangoValidationError):
        from rest_framework.exceptions import ValidationError

        exc = ValidationError(getattr(exc, "message_dict", exc.messages))
    response = drf_handler(exc, context)
    request = context.get("request")
    request_id = getattr(request, "request_id", "")
    if response is None:
        # Never put exception text, request payloads or credentials in the response/log.
        import logging

        logging.getLogger(__name__).error(
            "unhandled_api_error", extra={"error_type": type(exc).__name__}
        )
        return Response(
            {
                "code": "internal_error",
                "message": "خطای داخلی سامانه.",
                "fields": {},
                "request_id": request_id,
            },
            status=500,
        )
    detail = response.data
    code = getattr(exc, "default_code", "error")
    message = "داده‌های ورودی معتبر نیستند."
    fields = detail
    if isinstance(detail, dict) and "detail" in detail:
        message = str(detail["detail"])
        code = getattr(detail["detail"], "code", code)
        fields = {}
    response.data = {
        "code": str(code),
        "message": message,
        "fields": fields,
        "request_id": request_id,
    }
    return response
