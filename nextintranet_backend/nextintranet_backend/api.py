
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model
from .serializers.login import RegisterSerializer
from rest_framework import generics

class RegisterView(generics.CreateAPIView):
    User = get_user_model()
    queryset = User.objects.all()
    permission_classes = (AllowAny,) #  necessary if your default permission class is set to IsAuthenticated
    serializer_class = RegisterSerializer

    def perform_create(self, serializer):
        user = serializer.save()

        # perform additional actions such as sending a welcome email

        return Response(user, status=status.HTTP_200_OK)