
from django.urls import path
from django.urls import include

from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from rest_framework.routers import DefaultRouter


from .views import home
from .views import user
from .views import identifier
from .views.printList import PrintListRouter, PrintItemRouter, PrintApi


from .schema import schema

from django.urls import include

from graphene_django.views import GraphQLView

from nextintranet_warehouse import urls_api as warehouse_api_urls
from nextintranet_warehouse.views import kicad as kicadViews
from nextintranet_production import urls_api as production_api_urls


kicad_urlpatterns = [
    path('nextIntranet.kicad_httplib', kicadViews.KicadAPITemplateView.as_view(), name='kicad-httplib'),
    path('v1/categories.json', kicadViews.KicadAPICategoriesView.as_view(), name='kicad-parts-category'),
    path('v1/parts/category/<id>.json', kicadViews.KicadPartsCategoryView.as_view(), name='kicad-parts-category'),
    path('v1/parts/<id>.json', kicadViews.KicadPartsView.as_view(), name='kicad-parts'),
    path('v1/', kicadViews.KicadApiView.as_view(), name='kicad'),
]

# /api/
urlpatterns = [
    path('schema/', SpectacularAPIView.as_view(), name='schema'),
        # Optional UI:
    path('schema/swagger-ui/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('kicad/', include(kicad_urlpatterns)),
    path('v1/me/', user.UserApiDetailedView.as_view(), name='api-user-detail'),
    path('v1/core/identifier/', identifier.IdentifierApiView.as_view(), name='identifier'),
    path('v1/store/', include(warehouse_api_urls)),
    path('v1/production/', include(production_api_urls)),
    path('v1/graphql/', GraphQLView.as_view(graphiql=True, schema=schema), name='graphql'),

    path('v1/print/list/', include(PrintListRouter.urls), name='api_print_list'),
    path('v1/print/item/', include(PrintItemRouter.urls), name='api_print_item'),
    path('v1/print/', PrintApi.as_view(), name='api_print'),
]
