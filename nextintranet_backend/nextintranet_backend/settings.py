from pathlib import Path
from datetime import timedelta
import datetime
import os


def _load_env_file(path):
    if not path.exists():
        return
    with path.open() as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = value


BASE_DIR = Path(__file__).resolve().parent.parent
_load_env_file(BASE_DIR.parent / '.env')


SECRET_KEY = 'django-insecure-)6x5v2n-x$c@n98tdn$vwe*(1-#85osx2wr#r@hclrf48s%jbm'

DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '*']

SITE_URL = 'http://localhost:8000'

CORS_ORIGIN_WHITELIST = [
    "http://localhost:9000",
    "http://localhost:9000",
]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:9000",
    "http://localhost:9000",
]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:9000",
    "http://localhost:9000",
]

STATIC_ROOT = BASE_DIR / 'static'

STATICFILES_DIRS = [
]

# S3/MinIO storage (optional)
S3_ACCESS_KEY_ID = os.getenv('S3_ACCESS_KEY_ID') or os.getenv('AWS_ACCESS_KEY_ID') or os.getenv('MINIO_ROOT_USER')
S3_SECRET_ACCESS_KEY = os.getenv('S3_SECRET_ACCESS_KEY') or os.getenv('AWS_SECRET_ACCESS_KEY') or os.getenv('MINIO_ROOT_PASSWORD')
S3_STORAGE_BUCKET_NAME = os.getenv('S3_STORAGE_BUCKET_NAME') or os.getenv('AWS_STORAGE_BUCKET_NAME') or os.getenv('MINIO_BUCKET')
S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL') or os.getenv('AWS_S3_ENDPOINT_URL')
S3_PUBLIC_ENDPOINT_URL = os.getenv('S3_PUBLIC_ENDPOINT_URL') or os.getenv('AWS_S3_PUBLIC_ENDPOINT_URL')
S3_REGION_NAME = os.getenv('S3_REGION_NAME') or os.getenv('AWS_S3_REGION_NAME', 'us-east-1')
S3_ADDRESSING_STYLE = os.getenv('S3_ADDRESSING_STYLE') or os.getenv('AWS_S3_ADDRESSING_STYLE', 'path')
AWS_ACCESS_KEY_ID = S3_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY = S3_SECRET_ACCESS_KEY
AWS_STORAGE_BUCKET_NAME = S3_STORAGE_BUCKET_NAME
AWS_S3_ENDPOINT_URL = S3_ENDPOINT_URL
AWS_S3_PUBLIC_ENDPOINT_URL = S3_PUBLIC_ENDPOINT_URL
AWS_S3_REGION_NAME = S3_REGION_NAME
AWS_S3_ADDRESSING_STYLE = S3_ADDRESSING_STYLE
AWS_DEFAULT_ACL = None

if S3_ENDPOINT_URL and S3_STORAGE_BUCKET_NAME:
    STORAGES = {
        'default': {
            'BACKEND': 'nextintranet_backend.storage_backends.PublicS3Boto3Storage',
        },
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'colorfield',
    'channels',
    'mptt',
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'graphene_django',
    'graphql_jwt',
    "graphql_auth",
    'constance',
    'crispy_forms',
    "crispy_bootstrap5",
    'django_select2',
    'django_htmx',
    'django_tables2',
    'django_filters',
    "formtools",
    'drf_spectacular',
    'drf_spectacular_sidecar',


    'nextintranet_backend',
    'nextintranet_warehouse.apps.NextintranetWarehouseConfig',
    'nextintranet_invoicing',
    'nextintranet_production',

]



CRISPY_ALLOWED_TEMPLATE_PACKS = "bootstrap5"
CRISPY_TEMPLATE_PACK = "bootstrap5"

CONSTANCE_BACKEND = 'constance.backends.redisd.CachingRedisBackend'
# optionally set a value ttl
CONSTANCE_REDIS_CACHE_TIMEOUT = 60

CONSTANCE_REDIS_CONNECTION = {
    'host': 'redis',
    'port': 6379,
    'db': 0,
}


SPECTACULAR_SETTINGS = {
    'TITLE': 'NextIntranet API',
    'DESCRIPTION': 'NextIntranet',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'SWAGGER_UI_DIST': 'SIDECAR',
    'SWAGGER_UI_FAVICON_HREF': 'SIDECAR',
    'REDOC_DIST': 'SIDECAR',
}

CONSTANCE_CONFIG = {
    'COMPANY_NAME', ('NextIntranet', 'Company name'),
    'COMPANY_ADDRESS', ('', 'Company address'),
    'COMPANY_REGNO', ('', 'Company registration number'),
    'COMPANY_VATNO', ('', 'Company VAT number'),

}


GRAPHENE = {
    'SCHEMA': 'nextintranet_backend.schema.schema',
    "MIDDLEWARE": [
        "graphql_jwt.middleware.JSONWebTokenMiddleware",
    ],

}

GRAPHQL_JWT = {
    "JWT_ALLOW_REFRESH": True,
    'JWT_EXPIRATION_DELTA': datetime.timedelta(days=7),
    'JWT_REFRESH_EXPIRATION_DELTA': datetime.timedelta(days=30),
    # "JWT_ALLOW_ANY_CLASSES": [
    #     "graphql_auth.mutations.Register",
    #     "graphql_auth.mutations.VerifyAccount",
    #     "graphql_auth.mutations.ObtainJSONWebToken",
    # ],
}


AUTHENTICATION_BACKENDS = [
    "graphql_jwt.backends.JSONWebTokenBackend",
    "django.contrib.auth.backends.ModelBackend",  # Standardní Django backend
]

AUTH_USER_MODEL = 'nextintranet_backend.User'

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    # 'django.middleware.csrf.CsrfViewMiddleware',
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # 'graphql_jwt.middleware.JSONWebTokenMiddleware',
    'nextintranet_backend.middleware.LoginRequiredMiddleware',
    'nextintranet_backend.middleware.debug_middleware',
    'nextintranet_backend.middleware.InAppMiddleware',
]

# CORS_ALLOWED_ORIGINS = [
#     "http://localhost:9000",
#     "http://127.0.0.1:9000",
#     'http://*',  # Allow all origins
# ]
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = [
    'authorization',
    'content-type',
    'x-csrftoken',
    'x-requested-with',
]


ROOT_URLCONF = 'nextintranet_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'nextintranet_backend.context_processors.in_app',
            ],
        },
    },
]

WSGI_APPLICATION = 'nextintranet_backend.wsgi.application'


DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'nextintranet',
        'USER': 'nextintranet_user',
        'PASSWORD': 'nextintranet_password',
        'HOST': 'db_nextintranet',
    }
}


CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': 'redis://redis:6379/1',
        'OPTIONS': {
        }
    },
    "select2": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": "redis://redis:6379/2",
        "OPTIONS": {
        }
    }
}


CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [("redis", 6379)],
        },
    },
}

SELECT2_CACHE_BACKEND = "select2"

SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
SESSION_CACHE_ALIAS = 'default'

LOGIN_URL = '/login/'

ASGI_APPLICATION = "nextintranet_backend.asgi.application"

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}


SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),  # Platnost access tokenu
    'REFRESH_TOKEN_LIFETIME': timedelta(days=10),  # Platnost refresh tokenu
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "USER_ID_FIELD": "id",
}

# Password validation
# https://docs.djangoproject.com/en/5.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.1/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.1/howto/static-files/

STATIC_URL = 'static/'

# Default primary key field type
# https://docs.djangoproject.com/en/5.1/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
