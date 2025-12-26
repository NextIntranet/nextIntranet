from typing import Optional
from urllib.parse import parse_qs

from channels.auth import AuthMiddlewareStack
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.db import close_old_connections


@database_sync_to_async
def _get_user(token_key: Optional[str]):
    from django.contrib.auth.models import AnonymousUser
    from rest_framework_simplejwt.tokens import AccessToken
    
    if not token_key:
        return AnonymousUser()

    try:
        token = AccessToken(token_key)
        user_id = token.get('user_id')
        if not user_id:
            return AnonymousUser()
        return get_user_model().objects.get(id=user_id)
    except Exception:
        return AnonymousUser()


def _mask_token(token: Optional[str]) -> str:
    if not token:
        return 'none'
    if len(token) <= 10:
        return f'{token[:2]}...'
    return f'{token[:4]}...{token[-4:]}'


class TokenAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        close_old_connections()
        print(f"WS auth middleware: path={scope.get('path')} query={scope.get('query_string', b'').decode()}")
        user = scope.get('user')
        if user and getattr(user, 'is_authenticated', False):
            print(f"WS auth middleware: user already authenticated ({user})")
            return await super().__call__(scope, receive, send)

        token = None
        query_string = scope.get('query_string', b'').decode()
        if query_string:
            token = parse_qs(query_string).get('token', [None])[0]

        if not token:
            for header, value in scope.get('headers', []):
                if header == b'authorization':
                    auth_value = value.decode()
                    if auth_value.startswith('Bearer '):
                        token = auth_value.split(' ', 1)[1]
                    break

        print(f"WS auth middleware: token={_mask_token(token)}")
        scope['user'] = await _get_user(token)
        print(f"WS auth middleware: resolved user={scope['user']}")
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    return AuthMiddlewareStack(TokenAuthMiddleware(inner))
