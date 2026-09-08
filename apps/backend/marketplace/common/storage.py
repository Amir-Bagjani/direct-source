import boto3
from botocore.config import Config
from django.conf import settings
from storages.backends.s3 import S3Storage


class PrivateS3Storage(S3Storage):
    def url(self, name, parameters=None, expire=None, http_method=None):
        if not settings.S3_PUBLIC_ENDPOINT_URL:
            return super().url(name, parameters=parameters, expire=expire, http_method=http_method)
        # Sign against the externally reachable hostname, without rewriting a signed URL.
        client = boto3.client(
            "s3",
            endpoint_url=settings.S3_PUBLIC_ENDPOINT_URL,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region_name,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket_name, "Key": name, **(parameters or {})},
            ExpiresIn=expire or self.querystring_expire,
            HttpMethod=http_method or "GET",
        )
