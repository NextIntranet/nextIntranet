import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, useRealtimeMessages, type RealtimeEvent } from '@nextintranet/core';
import { Activity, PackageSearch, Users, ShieldCheck, Sparkles, AlertTriangle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface User {
  id: string;
  username: string;
  email: string;
  is_superuser: boolean;
}

interface DashboardMetrics {
  total_components: number;
  components_with_stock: number;
  total_quantity: number;
  active_reservations: number;
  pending_purchase_requests: number;
  total_users: number;
  low_stock_components: number;
}

interface ActivityEvent extends RealtimeEvent {
  received_at: number;
}

export function HomePage() {
  const { data: user, isLoading: isLoadingUser, error: userError } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => apiFetch<User>('/api/v1/me/'),
  });

  const { data: metrics, isLoading: isLoadingMetrics, error: metricsError } = useQuery<DashboardMetrics>({
    queryKey: ['dashboard-metrics'],
    queryFn: () => apiFetch<DashboardMetrics>('/api/v1/dashboard/'),
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

  useRealtimeMessages(
    useCallback((event: RealtimeEvent) => {
      const id = event.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const received_at = typeof event.ts === 'number' ? event.ts : Date.now();
      setActivityEvents((prev) => {
        const next = [{ ...event, id, received_at }, ...prev];
        return next.slice(0, 24);
      });
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
      hint: `${metrics.pending_purchase_requests} pending requests`,
      icon: AlertTriangle,
    },
  ] : [];

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
        {metricCards.map((metric) => (
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
        ))}
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
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Live Activity</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="grid gap-3">
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

      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/40 p-4" />
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/40 p-4" />
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/40 p-4" />
      </div>

      <div className="rounded-xl border border-dashed border-border/70 bg-muted/40 p-6 min-h-[320px]" />
    </div>
  );
}
