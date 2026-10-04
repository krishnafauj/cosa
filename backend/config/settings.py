"""
Django settings for the IIITR Campus Portal backend.

All secrets and environment-specific values come from environment variables
(loaded from `.env` in development). See `.env.example` for the full list.
"""
from datetime import timedelta
from pathlib import Path
import os

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
# Render sets RENDER_EXTERNAL_HOSTNAME (e.g. cosa-u8hg.onrender.com) automatically.
RENDER_EXTERNAL_HOSTNAME = os.getenv("RENDER_EXTERNAL_HOSTNAME")
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)
    CSRF_TRUSTED_ORIGINS_EXTRA = [f"https://{RENDER_EXTERNAL_HOSTNAME}"]
else:
    CSRF_TRUSTED_ORIGINS_EXTRA = []

if not DEBUG and SECRET_KEY.startswith("dev-only"):
    raise RuntimeError("Set DJANGO_SECRET_KEY in production.")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "storages",
    # Local
    "apps.accounts",
    "apps.issues",
    "apps.cosa",
    "apps.notifications",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
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
            ],
        },
    },
]

AUTH_USER_MODEL = "accounts.User"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Database (Neon Postgres)
# ---------------------------------------------------------------------------
# DATABASE_URL should be Neon's *pooled* connection string (host contains
# "-pooler"). The pooler runs PgBouncer in transaction mode, so:
#   - server-side cursors are disabled (they don't survive across transactions)
#   - connections are reused for a short time and health-checked
# Without DATABASE_URL we fall back to SQLite for quick local hacking/tests.
DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL:
    DATABASES = {
        "default": dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=int(os.getenv("DB_CONN_MAX_AGE", "60")),
            conn_health_checks=True,
        )
    }
    DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# ---------------------------------------------------------------------------
# Cache (Redis when available, used by throttling)
# ---------------------------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL", "")
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# ---------------------------------------------------------------------------
# Auth / passwords
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# College login rules
ALLOWED_EMAIL_DOMAINS = env_list("ALLOWED_EMAIL_DOMAINS", "iiitr.ac.in,students.iiitr.ac.in")
STUDENT_EMAIL_DOMAIN = os.getenv("STUDENT_EMAIL_DOMAIN", "students.iiitr.ac.in")
# Student emails on the main domain look like cs23b1036@iiitr.ac.in:
#   <branch code><2-digit join year><programme letter><number>
STUDENT_EMAIL_REGEX = os.getenv(
    "STUDENT_EMAIL_REGEX", r"^(?P<code>[a-z]{2})(?P<yy>\d{2})(?P<prog>[a-z])(?P<num>\d{3,5})@iiitr\.ac\.in$"
)
# Branch code in the roll number -> branch, used to pre-fill the profile form.
# Add the other codes once confirmed, e.g. "cs:CSE,ad:AIDS,mc:MNC".
ROLL_BRANCH_CODES = dict(
    pair.split(":", 1) for pair in env_list("ROLL_BRANCH_CODES", "cs:CSE") if ":" in pair
)
GOOGLE_CLIENT_IDS = env_list("GOOGLE_CLIENT_IDS")

# ---------------------------------------------------------------------------
# REST framework + JWT
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "config.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("THROTTLE_ANON", "30/min"),
        "user": os.getenv("THROTTLE_USER", "240/min"),
        "auth": os.getenv("THROTTLE_AUTH", "10/min"),
    },
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTES", "15"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "SIGNING_KEY": os.getenv("JWT_SIGNING_KEY", SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "IIITR Campus Portal API",
    "DESCRIPTION": "Issues, COSA, clubs, events, committees and notifications.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ---------------------------------------------------------------------------
# CORS / CSRF / security
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
CORS_EXPOSE_HEADERS = ["Content-Disposition"]  # lets the browser read download file names
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000") + CSRF_TRUSTED_ORIGINS_EXTRA

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    SECURE_CONTENT_TYPE_NOSNIFF = True

# ---------------------------------------------------------------------------
# Static & media (S3 when configured)
# ---------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

AWS_STORAGE_BUCKET_NAME = os.getenv("S3_BUCKET", "")
# Uploads go to S3 in production. While developing (DEBUG) they are saved in
# backend/media/ unless USE_S3=true, so a bad AWS key never blocks local work.
USE_S3 = env_bool("USE_S3", not DEBUG) and bool(AWS_STORAGE_BUCKET_NAME)
if USE_S3:
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("S3_ACCESS_KEY")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY") or os.getenv("S3_SECRET_KEY")
    AWS_S3_REGION_NAME = os.getenv("AWS_REGION", "us-east-1")
    AWS_LOCATION = os.getenv("S3_PREFIX", "campus-portal")
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = True  # private bucket, signed URLs
    AWS_QUERYSTRING_EXPIRE = 3600
    AWS_S3_FILE_OVERWRITE = False
    MEDIA_STORAGE_BACKEND = "storages.backends.s3.S3Storage"
else:
    MEDIA_STORAGE_BACKEND = "django.core.files.storage.FileSystemStorage"

STORAGES = {
    "default": {"BACKEND": MEDIA_STORAGE_BACKEND},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "5"))
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_MB * 1024 * 1024

# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "COSA Portal <no-reply@iiitr.ac.in>")

# ---------------------------------------------------------------------------
# Business rules (see the requirements doc)
# ---------------------------------------------------------------------------
PORTAL_RULES = {
    "ESCALATION_AFTER_DAYS": int(os.getenv("ESCALATION_AFTER_DAYS", "5")),
    "REOPEN_WINDOW_DAYS": int(os.getenv("REOPEN_WINDOW_DAYS", "7")),
    "MAX_REOPENS": int(os.getenv("MAX_REOPENS", "3")),
    "REMARKS_PER_DAY": int(os.getenv("REMARKS_PER_DAY", "3")),
    "REMARK_EDIT_MINUTES": 10,
    "UPDATE_EDIT_MINUTES": 15,
    "MAX_ATTACHMENTS": 3,
}

# ---------------------------------------------------------------------------
# i18n / misc
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
}
