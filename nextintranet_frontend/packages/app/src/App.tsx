import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { StorePage } from './pages/StorePage';
import { ComponentDetailPage } from './pages/ComponentDetailPage';
import { LocationsPage } from './pages/LocationsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ReservationsPage } from './pages/ReservationsPage';
import { PurchaseRequestsPage } from './pages/PurchaseRequestsPage';
import { UsersPage } from './pages/UsersPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { ProfileRedirectPage } from './pages/MeRedirectPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { PacketDetailPage } from './pages/PacketDetailPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { RequirePermission } from './components/RequirePermission';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="store" element={<StorePage />} />
          <Route
            path="store/location"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <LocationsPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/location/:id"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <LocationsPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/supplier"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <SuppliersPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/supplier/:id"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <SuppliersPage />
              </RequirePermission>
            }
          />
          <Route path="store/category" element={<CategoriesPage />} />
          <Route path="store/category/:id" element={<CategoriesPage />} />
          <Route
            path="store/reservations"
            element={
              <RequirePermission area="warehouse-operations" minLevel="read">
                <ReservationsPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/reservations/:id"
            element={
              <RequirePermission area="warehouse-operations" minLevel="read">
                <ReservationsPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/purchase-requests"
            element={
              <RequirePermission area="warehouse-operations" minLevel="read">
                <PurchaseRequestsPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/purchase-requests/:id"
            element={
              <RequirePermission area="warehouse-operations" minLevel="read">
                <PurchaseRequestsPage />
              </RequirePermission>
            }
          />
          <Route path="store/component/:id" element={<ComponentDetailPage />} />
          <Route
            path="store/packet/:id"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <PacketDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="user"
            element={
              <RequirePermission area="user" minLevel="read">
                <UsersPage />
              </RequirePermission>
            }
          />
          <Route path="user/:id" element={<UserDetailPage />} />
          <Route path="profile" element={<ProfileRedirectPage />} />
          <Route path="401" element={<UnauthorizedPage />} />
          <Route path="403" element={<ForbiddenPage />} />
          <Route path="404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
