import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, useRealtimeMessages, type RealtimeEvent } from '@nextintranet/core';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Activity,
  PackageSearch,
  Users,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  ClipboardList,
  Truck,
  FileText,
  ArrowLeftRight,
  UserCheck,
  Banknote,
  History,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { ActivityLogTable, type PaginatedActivities } from '@/components/ActivityLogTable';

interface User {
  id: string;
  username: string;
  email: string;
  is_superuser: boolean;
}

interface RecentPurchase {
  id: string;
  supplier_name: string | null;
  status: string;
  created_at: string | null;
}

interface OperationsTrendPoint {
  date: string;
  inbound: number;
  outbound: number;
}

interface DashboardMetrics {
  total_components: number;
  components_with_stock: number;
  total_quantity: number;
  active_reservations: number;
  pending_purchase_requests: number;
  total_users: number;
  low_stock_components: number;
  purchases_in_progress: number;
  purchases_completed_this_month: number;
  locations_count: number;
  categories_count: number;
  zero_stock_components: number;
  operations_today: number;
  operations_7d: number;
  active_operators_7d: number;
  purchased_value_this_month: number;
  operations_trend: OperationsTrendPoint[];
  recent_purchases: RecentPurchase[];
}

interface ActivityEvent extends RealtimeEvent {
  received_at: number;
}

const trendChartConfig = {
  inbound: { label: 'Inbound', color: 'var(--color-emerald-600, #059669)' },
  outbound: { label: 'Outbound', color: 'var(--color-red-600, #dc2626)' },
} satisfies ChartConfig;

/** Models whose changes should refresh the persisted dashboard widgets. */
const ACTIVITY_MODELS = new Set(['warehouseactivity', 'stockoperation']);

export function HomePage() {
  const queryClient = useQueryClient();

  const { data: user, isLoading: isLoadingUser, error: userError } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => apiFetch<User>('/api/v1/me/'),
  });

  const { data: metrics, isLoading: isLoadingMetrics, error: metricsError } = useQuery<DashboardMetrics>({
    queryKey: ['dashboard-metrics'],
    queryFn: () => apiFetch<DashboardMetrics>('/api/v1/dashboard/'),
  });

  const { data: recentOps, isLoading: isLoadingRecentOps } = useQuery<PaginatedActivities>({
    queryKey: ['dashboard-recent-activities'],
    queryFn: () =>
      apiFetch<PaginatedActivities>('/api/v1/store/activity/?mode=count&page_size=10'),
  });

  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const formatTimestamp = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    []
  );
  const formatCurrency = useMemo(
    () =>
      new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency: 'CZK',
        maximumFractionDigits: 0,
      }),
    []
  );
  const formatTrendDay = useMemo(
    () => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }),
    []
  );

  const formatPayload = useCallback((payload: unknown) => {
    if (payload === null || payload === undefined) {
      return null;
    }
    if (typeof payload === 'string') {
      return payload;
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return 'Payload unavailable';
    }
  }, []);

  // Debounce refetches so a bulk stocking run does not fire one per row.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    []
  );

  useRealtimeMessages(
    useCallback((event: RealtimeEvent) => {
      const id = event.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const received_at = typeof event.ts === 'number' ? event.ts : Date.now();
      setActivityEvents((prev) => {
        const next = [{ ...event, id, received_at }, ...prev];
        return next.slice(0, 24);
      });

      const model = (event.payload as { model?: string } | undefined)?.model;
      if (event.type === 'model.changed' && model && ACTIVITY_MODELS.has(model)) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-recent-activities'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
        }, 2000);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const isLoading = isLoadingUser || isLoadingMetrics;
  const error = userError || metricsError;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/60 bg-destructive/10 text-destructive">
        <CardHeader>
          <CardTitle>Unable to load your dashboard</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-destructive/80">
          Please refresh the page or try again later.
        </CardContent>
      </Card>
    );
  }

  const metricCards = metrics ? [
    {
      label: 'Total Components',
      value: metrics.total_components.toLocaleString(),
      hint: `${metrics.components_with_stock} with stock`,
      icon: PackageSearch,
    },
    {
      label: 'Total Quantity',
      value: Math.round(metrics.total_quantity).toLocaleString(),
      hint: 'Items in warehouse',
      icon: Activity,
    },
    {
      label: 'Active Users',
      value: metrics.total_users.toLocaleString(),
      hint: 'Team members',
      icon: Users,
    },
    {
      label: 'Low Stock Alert',
      value: metrics.low_stock_components.toLocaleString(),
      hint: `${metrics.zero_stock_components} out of stock · ${metrics.pending_purchase_requests} pending requests`,
      icon: AlertTriangle,
    },
  ] : [];

  const operationsMetricCards = metrics ? [
    {
      label: 'Operations Today',
      value: (metrics.operations_today ?? 0).toLocaleString(),
      hint: `${(metrics.operations_7d ?? 0).toLocaleString()} in last 7 days`,
      icon: ArrowLeftRight,
    },
    {
      label: 'Active Operators',
      value: (metrics.active_operators_7d ?? 0).toLocaleString(),
      hint: 'People moving stock in last 7 days',
      icon: UserCheck,
    },
    {
      label: 'Purchased This Month',
      value: formatCurrency.format(metrics.purchased_value_this_month ?? 0),
      hint: 'Value of stock bought in',
      icon: Banknote,
    },
  ] : [];

  const secondaryMetricCards = metrics ? [
    {
      label: 'Active Reservations',
      value: (metrics.active_reservations ?? 0).toLocaleString(),
      hint: 'Reservations without expiration or still valid',
      icon: ClipboardList,
    },
    {
      label: 'Purchases in Progress',
      value: (metrics.purchases_in_progress ?? 0).toLocaleString(),
      hint: `${metrics.purchases_completed_this_month ?? 0} completed this month`,
      icon: Truck,
    },
    {
      label: 'Pending Requests',
      value: (metrics.pending_purchase_requests ?? 0).toLocaleString(),
      hint: 'Purchase requests not yet assigned',
      icon: FileText,
    },
  ] : [];

  const trendData = (metrics?.operations_trend ?? []).map((point) => ({
    ...point,
    label: formatTrendDay.format(new Date(`${point.date}T00:00:00Z`)),
  }));

  const recentActivities = recentOps?.results ?? [];

  const formatStatus = (status: string) =>
    status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const renderMetricCard = (metric: {
    label: string;
    value: string;
    hint: string;
    icon: typeof Activity;
  }) => (
    <Card key={metric.label} className="shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <metric.icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {metric.label}
          </span>
          <span className="text-2xl font-semibold leading-tight">
            {metric.value}
          </span>
          <span className="text-xs text-muted-foreground">
            {metric.hint}
          </span>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          Welcome back, {user?.username}
        </h1>
        <p className="text-sm text-muted-foreground">
          Quick snapshot of your workspace status
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {metricCards.map(renderMetricCard)}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {operationsMetricCards.map(renderMetricCard)}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Recent Operations</CardTitle>
          <span className="text-sm font-normal text-muted-foreground">
            Last 10 stock operations across the warehouse
          </span>
        </CardHeader>
        <CardContent>
          {isLoadingRecentOps ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : recentActivities.length > 0 ? (
            <ActivityLogTable activities={recentActivities} showPacketColumn />
          ) : (
            <div className="rounded-xl bg-muted/70 p-4 text-sm text-muted-foreground">
              No stock operations recorded yet.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle>Operations Trend</CardTitle>
              <span className="text-sm font-normal text-muted-foreground">
                Inbound and outbound operations, last 180 days
              </span>
            </div>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ChartContainer config={trendChartConfig} className="h-[220px] w-full">
                <AreaChart data={trendData} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={48}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    dataKey="inbound"
                    stackId="ops"
                    type="monotone"
                    stroke="var(--color-inbound)"
                    fill="var(--color-inbound)"
                    fillOpacity={0.35}
                  />
                  <Area
                    dataKey="outbound"
                    stackId="ops"
                    type="monotone"
                    stroke="var(--color-outbound)"
                    fill="var(--color-outbound)"
                    fillOpacity={0.35}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="rounded-xl bg-muted/70 p-4 text-sm text-muted-foreground">
                No operations in the last 180 days.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Live Activity</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="grid max-h-[220px] gap-3 overflow-y-auto">
            {activityEvents.length === 0 ? (
              <div className="rounded-xl bg-muted/70 p-4 text-sm text-muted-foreground">
                Realtime events will appear here.
              </div>
            ) : (
              activityEvents.map((event) => {
                const payload = formatPayload(event.payload);
                const scope = event.stationId ? `Station ${event.stationId}` : 'Broadcast';
                return (
                  <div key={event.id} className="rounded-xl border border-border/60 bg-muted/40 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{event.type}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp.format(new Date(event.received_at))}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-background px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {scope}
                      </span>
                      {event.deviceId && <span>Device {event.deviceId}</span>}
                    </div>
                    {payload && (
                      <div className="mt-2 rounded-md bg-background/70 px-2 py-1 text-xs text-muted-foreground">
                        {payload}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {secondaryMetricCards.map(renderMetricCard)}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Account Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
              <span className="text-muted-foreground">Username</span>
              <span className="font-medium">{user?.username}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
              <span className="text-muted-foreground">Role</span>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <ShieldCheck className="h-4 w-4" />
                {user?.is_superuser ? 'Administrator' : 'User'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
              <span className="text-muted-foreground">Structure</span>
              <span className="font-medium">
                {(metrics?.locations_count ?? 0).toLocaleString()} locations ·{' '}
                {(metrics?.categories_count ?? 0).toLocaleString()} categories
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Recent Purchases</CardTitle>
            <span className="text-sm font-normal text-muted-foreground">
              Latest purchase orders
            </span>
          </CardHeader>
          <CardContent>
            {(metrics?.recent_purchases?.length ?? 0) > 0 ? (
              <ul className="space-y-2">
                {metrics?.recent_purchases?.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/store/purchase/${p.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
                    >
                      <span className="font-medium text-foreground">
                        {p.supplier_name ?? '—'}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {formatStatus(p.status)}
                      </span>
                      <span className="w-full text-xs text-muted-foreground sm:w-auto">
                        {p.created_at
                          ? new Date(p.created_at).toLocaleString()
                          : '—'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl bg-muted/70 p-4 text-sm text-muted-foreground">
                No recent purchases.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
