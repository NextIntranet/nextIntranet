import { tokenStorage } from '@nextintranet/core';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = tokenStorage.isAuthenticated();

  if (!isAuthenticated) {
    return <UnauthorizedPage />;
  }

  return <>{children}</>;
}
