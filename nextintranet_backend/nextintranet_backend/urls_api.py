
from django.urls import path
from django.urls import include

from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView


from .views import home
from .views import user
from .views import identifier


from .schema import schema
from graphene_django.views import GraphQLView

from nextintranet_warehouse import urls_api as warehouse_api_urls


# /api/
urlpatterns = [
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('v1/me/', user.UserApiDetailedView.as_view(), name='user-detail'),

    path('v1/core/identifier/', identifier.IdentifierApiView.as_view(), name='identifier'),

    path('v1/store/', include(warehouse_api_urls)),

    path('v1/graphql/', GraphQLView.as_view(graphiql=True, schema=schema), name='graphql'),
]