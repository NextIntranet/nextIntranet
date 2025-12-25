import { useQuery } from '@tanstack/react-query';
import { apiFetch, useRealtimeMessages } from '@nextintranet/core';
import { Activity, Factory, PackageSearch, Users, ShieldCheck, Sparkles } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface User {
  id: string;
  username: string;
  email: string;
  is_superuser: boolean;
}

const metrics = [
  {
    label: 'Warehouse Items',
    value: '1,247',
    hint: 'Up 12% vs last month',
    icon: PackageSearch,
  },
  {
    label: 'Active Production',
    value: '23',
    hint: '5 pending review',
    icon: Factory,
  },
  {
    label: 'Team Members',
    value: '18',
    hint: '3 online now',
    icon: Users,
  },
  {
    label: 'Task Health',
    value: '89%',
    hint: 'This week',
    icon: Activity,
  },
];

export function HomePage() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => apiFetch<User>('/api/v1/me/'),
  });

  useRealtimeMessages((event: unknown) => {
    console.log('Realtime event:', event);
  });

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
        {metrics.map((metric) => (
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
          <CardContent className="grid auto-rows-min gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-muted/70 p-4 text-sm text-muted-foreground">
              Realtime events will appear here.
            </div>
            <div className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
              Keep this tab open to stay in sync.
            </div>
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
