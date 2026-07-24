import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, tokenStorage } from '@nextintranet/core';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { StorePage } from './pages/StorePage';
import { ComponentDetailPage } from './pages/ComponentDetailPage';
import { LocationsPage } from './pages/LocationsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ParameterTypesPage } from './pages/ParameterTypesPage';
import { InventoryCampaignsPage } from './pages/InventoryCampaignsPage';
import { InventoryLocationStatusPage } from './pages/InventoryLocationStatusPage';
import { InventoryPacketListPage } from './pages/InventoryPacketListPage';
import { InventoryPage } from './pages/InventoryPage';
import { ReservationsPage } from './pages/ReservationsPage';
import { PurchaseRequestsPage } from './pages/PurchaseRequestsPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { PurchaseDetailPage } from './pages/PurchaseDetailPage';
import { UsersPage } from './pages/UsersPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { ProfileRedirectPage } from './pages/MeRedirectPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { PacketDetailPage } from './pages/PacketDetailPage';
import { QrRedirectPage } from './pages/QrRedirectPage';
import { PrintQueuePage } from './pages/PrintQueuePage';
import { HardwarePage } from './pages/HardwarePage';
import { SettingsPage } from './pages/SettingsPage';
import { ServiceTokensPage } from './pages/ServiceTokensPage';
import { SoftwareSettingsPage } from './pages/SoftwareSettingsPage';
import { LabelTemplatesPage } from './pages/LabelTemplatesPage';
import { DocsPage } from './pages/DocsPage';
import { AboutPage } from './pages/AboutPage';
import { SupplierRelationPage } from './pages/SupplierRelationPage';
import { ProductionPage } from './pages/ProductionPage';
import { ProductionBomPage } from './pages/ProductionBomPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { RequirePermission } from './components/RequirePermission';
import { applyBrandingMeta, type BrandingSettings } from './lib/branding';

function useBrandingMeta() {
  const isAuthenticated = tokenStorage.isAuthenticated();
  const { data: branding } = useQuery({
    queryKey: ['branding-settings'],
    queryFn: () => apiFetch<BrandingSettings>('/api/v1/setting/branding/'),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  useEffect(() => {
    applyBrandingMeta(branding);
  }, [branding]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<BrandingSettings | null>).detail;
      applyBrandingMeta(detail);
    };
    window.addEventListener('branding-updated', handler);
    return () => window.removeEventListener('branding-updated', handler);
  }, []);
}

export function App() {
  useBrandingMeta();

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
          <Route path="q/:kind/:id" element={<QrRedirectPage />} />
          <Route path="docs/*" element={<DocsPage />} />
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
            path="store/parameter-type"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <ParameterTypesPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/parameter-type/:id"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <ParameterTypesPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/inventory-campaign"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <InventoryCampaignsPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/inventory-campaign/:id"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <InventoryCampaignsPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/inventory"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <InventoryPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/inventory/packets"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <InventoryPacketListPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/inventory/status"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <InventoryLocationStatusPage />
              </RequirePermission>
            }
          />
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
            path="store/purchase"
            element={
              <RequirePermission area="warehouse-operations" minLevel="read">
                <PurchasesPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/purchase/:id"
            element={
              <RequirePermission area="warehouse-operations" minLevel="read">
                <PurchaseDetailPage />
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
            path="store/supplier-relation/:id"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <SupplierRelationPage />
              </RequirePermission>
            }
          />
          <Route
            path="store/packet/:id"
            element={
              <RequirePermission area="warehouse" minLevel="read">
                <PacketDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="print/queue"
            element={
              <RequirePermission area="warehouse-operations" minLevel="read">
                <PrintQueuePage />
              </RequirePermission>
            }
          />
          <Route
            path="print/queue/:id"
            element={
              <RequirePermission area="warehouse-operations" minLevel="read">
                <PrintQueuePage />
              </RequirePermission>
            }
          />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/service-token" element={<ServiceTokensPage />} />
          <Route path="settings/software" element={<SoftwareSettingsPage />} />
          <Route path="settings/label-template" element={<LabelTemplatesPage />} />
          <Route path="setting/hardware" element={<HardwarePage />} />
          <Route path="settings/hardware" element={<Navigate to="/setting/hardware" replace />} />
          <Route path="setting/service-token" element={<Navigate to="/settings/service-token" replace />} />
          <Route path="setting/software" element={<Navigate to="/settings/software" replace />} />
          <Route path="hardware" element={<Navigate to="/setting/hardware" replace />} />
          <Route
            path="production"
            element={<ProductionPage />}
          />
          <Route
            path="production/:productId"
            element={<ProductionPage />}
          />
          <Route
            path="production/:productId/bom/:bomId"
            element={<ProductionBomPage />}
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
          <Route path="about" element={<AboutPage />} />
          <Route path="401" element={<UnauthorizedPage />} />
          <Route path="403" element={<ForbiddenPage />} />
          <Route path="404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
