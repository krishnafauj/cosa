from django.urls import path

from . import views

urlpatterns = [
    path("google/", views.GoogleLoginView.as_view(), name="auth-google"),
    path("dev-login/", views.DevLoginView.as_view(), name="auth-dev-login"),
    path("token/refresh/", views.RefreshView.as_view(), name="auth-refresh"),
    path("logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("me/", views.MeView.as_view(), name="auth-me"),
    path("users/", views.UserSearchView.as_view(), name="user-search"),
    path("directory/", views.DirectoryView.as_view(), name="cosa-directory"),
]
