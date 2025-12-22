from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views.production import (
    ProductionFolderViewSet,
    ProductionViewSet,
    TemplateViewSet,
    TemplateComponentViewSet,
    RealizationViewSet,
    RealizationComponentViewSet,
)

router = DefaultRouter()
router.register(r'folders', ProductionFolderViewSet, basename='productionfolder')
router.register(r'productions', ProductionViewSet, basename='production')
router.register(r'templates', TemplateViewSet, basename='template')
router.register(r'template-components', TemplateComponentViewSet, basename='templatecomponent')
router.register(r'realizations', RealizationViewSet, basename='realization')
router.register(r'realization-components', RealizationComponentViewSet, basename='realizationcomponent')

urlpatterns = [
    path('', include(router.urls)),
]
