from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("categories", views.CategoryViewSet, basename="category")
router.register("issues", views.IssueViewSet, basename="issue")

urlpatterns = [
    path("updates/<int:pk>/", views.UpdateEditView.as_view(), name="update-edit"),
    path("remarks/<int:pk>/", views.RemarkEditView.as_view(), name="remark-edit"),
    path("cosa/dashboard/", views.CosaDashboardView.as_view(), name="cosa-dashboard"),
] + router.urls
