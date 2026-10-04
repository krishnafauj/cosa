import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)

try:  # boto3 is only used when uploads go to S3
    from botocore.exceptions import BotoCoreError, ClientError
except ImportError:  # pragma: no cover
    BotoCoreError = ClientError = ()


def api_exception_handler(exc, context):
    """JSON errors everywhere, including storage failures."""
    if isinstance(exc, DjangoValidationError):
        detail = exc.message_dict if hasattr(exc, "error_dict") else {"detail": exc.messages}
        exc = exceptions.ValidationError(detail)

    if ClientError and isinstance(exc, (ClientError, BotoCoreError)):
        code = getattr(exc, "response", {}).get("Error", {}).get("Code", type(exc).__name__)
        logger.exception("File storage (S3) error: %s", code)
        return Response(
            {"detail": f"Couldn't save the file to storage (S3: {code}). Check the AWS keys and bucket in backend/.env."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return exception_handler(exc, context)
