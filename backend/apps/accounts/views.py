from django.conf import settings
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import AuthenticationFailed, NotFound
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .models import RoleMailbox, User
from .serializers import (
    DevLoginSerializer,
    GoogleLoginSerializer,
    LogoutSerializer,
    MeSerializer,
    RoleMailboxSerializer,
    UserBriefSerializer,
)
from .services import issue_tokens, resolve_login

_google_request = google_requests.Request()


def _login_response(user, request):
    data = issue_tokens(user)
    data["user"] = MeSerializer(user, context={"request": request}).data
    return Response(data, status=status.HTTP_200_OK)


class GoogleLoginView(APIView):
    """Exchange a Google ID token (from Google Identity Services on the
    frontend) for our own access + refresh tokens."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"
    serializer_class = GoogleLoginSerializer

    @extend_schema(request=GoogleLoginSerializer)
    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not settings.GOOGLE_CLIENT_IDS:
            raise AuthenticationFailed("Google login is not configured (GOOGLE_CLIENT_IDS).")
        try:
            claims = google_id_token.verify_oauth2_token(
                serializer.validated_data["id_token"], _google_request
            )
        except ValueError as exc:
            raise AuthenticationFailed(f"Invalid Google token: {exc}") from exc

        if claims.get("aud") not in settings.GOOGLE_CLIENT_IDS:
            raise AuthenticationFailed("Google token was issued for a different app.")
        if not claims.get("email_verified"):
            raise AuthenticationFailed("Google email is not verified.")

        user = resolve_login(
            claims["email"],
            full_name=claims.get("name", ""),
            avatar_url=claims.get("picture", ""),
        )
        return _login_response(user, request)


class DevLoginView(APIView):
    """Local development only (DEBUG and ALLOW_DEV_LOGIN): log in by email."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"
    serializer_class = DevLoginSerializer

    @extend_schema(request=DevLoginSerializer)
    def post(self, request):
        if not settings.ALLOW_DEV_LOGIN:
            raise NotFound()
        serializer = DevLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = resolve_login(
            serializer.validated_data["email"],
            full_name=serializer.validated_data.get("full_name", ""),
        )
        return _login_response(user, request)


class RefreshView(TokenRefreshView):
    """Rotate the refresh token: returns a new access AND a new refresh token.
    The old refresh token is blacklisted."""

    throttle_scope = "auth"


class LogoutView(APIView):
    @extend_schema(request=LogoutSerializer, responses={205: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            if str(token.get("user_id")) != str(request.user.pk):
                raise AuthenticationFailed("Token does not belong to this user.")
            token.blacklist()
        except TokenError as exc:
            raise AuthenticationFailed(str(exc)) from exc
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    http_method_names = ["get", "patch"]

    def get_object(self):
        return self.request.user


class UserSearchView(generics.ListAPIView):
    """Pick people to tag, assign or add to committees.
    Students may only search COSA members; COSA can search everyone."""

    serializer_class = UserBriefSerializer
    search_fields = ["full_name", "email", "roll_number"]
    filterset_fields = ["user_type"]

    def get_queryset(self):
        qs = User.objects.filter(is_active=True)
        if getattr(self, "swagger_fake_view", False):
            return qs
        if not self.request.user.is_cosa:
            qs = qs.filter(user_type=User.UserType.COSA)
        return qs.order_by("full_name", "email")


class DirectoryView(generics.ListAPIView):
    """Current COSA office bearers."""

    serializer_class = RoleMailboxSerializer
    pagination_class = None

    def get_queryset(self):
        return RoleMailbox.objects.filter(is_active=True).select_related("category")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        emails = list(self.get_queryset().values_list("email", flat=True))
        ctx["users_by_email"] = dict(
            User.objects.filter(email__in=emails).values_list("email", "id")
        )
        return ctx
