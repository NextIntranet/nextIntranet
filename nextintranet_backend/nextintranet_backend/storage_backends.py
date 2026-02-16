from urllib.parse import urlparse

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class BasePublicEndpointS3Storage(S3Boto3Storage):
    def url(self, name, parameters=None, expire=None):
        url = super().url(name, parameters=parameters, expire=expire)
        public_endpoint = getattr(settings, 'S3_PUBLIC_ENDPOINT_URL', None)
        internal_endpoint = getattr(settings, 'S3_ENDPOINT_URL', None)
        if not public_endpoint:
            public_endpoint = getattr(settings, 'AWS_S3_PUBLIC_ENDPOINT_URL', None)
        if not internal_endpoint:
            internal_endpoint = getattr(settings, 'AWS_S3_ENDPOINT_URL', None)
        bucket = getattr(settings, 'S3_STORAGE_BUCKET_NAME', None)
        if not bucket:
            bucket = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', None)
        if public_endpoint and internal_endpoint and url.startswith(internal_endpoint):
            return public_endpoint + url[len(internal_endpoint):]
        parsed = urlparse(url)
        path = parsed.path or ''
        if public_endpoint and bucket and path.startswith(f'/{bucket}/'):
            return f"{public_endpoint.rstrip('/')}{path}"
        return url


class PublicS3Boto3Storage(BasePublicEndpointS3Storage):
    querystring_auth = False


class SignedS3Boto3Storage(BasePublicEndpointS3Storage):
    querystring_auth = True
