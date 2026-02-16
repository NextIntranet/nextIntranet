from urllib.parse import urlparse

from django.conf import settings
from rest_framework import serializers

from nextintranet_warehouse.models.component import Component

class ComponentSerializer(serializers.ModelSerializer):
    primary_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Component
        fields = '__all__'

    def get_primary_image_url(self, instance):
        primary_document = instance.documents.filter(is_primary=True).order_by('id').first()
        if primary_document:
            url = primary_document.get_url
        else:
            url = instance.primary_image
        if not url:
            return None

        public_endpoint = getattr(settings, 'S3_PUBLIC_ENDPOINT_URL', None)
        internal_endpoint = getattr(settings, 'S3_ENDPOINT_URL', None)
        bucket = getattr(settings, 'S3_STORAGE_BUCKET_NAME', None)
        if not public_endpoint:
            public_endpoint = getattr(settings, 'AWS_S3_PUBLIC_ENDPOINT_URL', None)
        if not internal_endpoint:
            internal_endpoint = getattr(settings, 'AWS_S3_ENDPOINT_URL', None)
        if not bucket:
            bucket = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', None)

        if public_endpoint and internal_endpoint and url.startswith(internal_endpoint):
            return public_endpoint.rstrip('/') + url[len(internal_endpoint):]

        parsed = urlparse(url)
        path = parsed.path or ''
        if public_endpoint and bucket and path.startswith(f'/{bucket}/'):
            return f"{public_endpoint.rstrip('/')}{path}"
        if public_endpoint and bucket and path.startswith('/documents/'):
            return f"{public_endpoint.rstrip('/')}/{bucket}{path}"

        return url
