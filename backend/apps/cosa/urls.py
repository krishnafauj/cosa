from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("clubs", views.ClubViewSet, basename="club")
router.register("events", views.EventViewSet, basename="event")
router.register("committees", views.CommitteeViewSet, basename="committee")
router.register("posts", views.CosaPostViewSet, basename="cosa-post")
urlpatterns = router.urls
