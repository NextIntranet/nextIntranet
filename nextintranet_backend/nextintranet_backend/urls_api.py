
from django.urls import path
from django.urls import include

from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView


from .views import home
from .views import user
from .views import identifier


from .schema import schema
from graphene_django.views import GraphQLView

from nextintranet_warehouse import urls_api as warehouse_api_urls


    # path('api/v1/me/', user.UserDetailView.as_view(), name='user-detail'),

    # path("api/v1/core/register/", RegisterView.as_view(), name="register"),
    # path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    # path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # # path('api/v1/logout/', LogoutView.as_view(), name='logout'),
    # path('api/v1/logout/', LogoutAPIView.as_view(), name='logout'),

    # #path('api/v1/warehouse/components/', ComponentListAPIView.as_view(), name='component-list'),
    # #path('api/v1/warehouse/locations/', WarehouseListAPIView.as_view(), name='warehouse-list'),
    # #path('api/v1/warehouse/locations/<int:pk>/', WarehouseDetailAPIView.as_view(), name='warehouse-detail'),


urlpatterns = [
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('v1/me/', user.UserApiDetailedView.as_view(), name='user-detail'),

    path('v1/core/identifier/', identifier.IdentifierApiView.as_view(), name='identifier'),

    path('v1/store/', include(warehouse_api_urls)),

    path('v1/graphql/', GraphQLView.as_view(graphiql=True, schema=schema), name='graphql'),
]