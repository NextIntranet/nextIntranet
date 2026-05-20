import { tokenStorage } from '@nextintranet/core';
import { Navigate, useLocation } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const isAuthenticated = tokenStorage.isAuthenticated();

  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}${location.hash}` || '/';
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}
