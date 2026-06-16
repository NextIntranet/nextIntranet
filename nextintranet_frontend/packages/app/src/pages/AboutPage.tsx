import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import type { BuildInfo } from "@nextintranet/core"
import { Github } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

function formatBuildDate(value: string | null): string {
  if (!value) return "unknown"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{children}</span>
    </div>
  )
}

export function AboutPage() {
  const { data: version, isLoading } = useQuery<BuildInfo>({
    queryKey: ["version"],
    queryFn: () => apiFetch<BuildInfo>("/api/v1/version/"),
    staleTime: Infinity,
  })

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">About</h1>
        <p className="text-sm text-muted-foreground">
          Build and version information for this NextIntranet instance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>NextIntranet</CardTitle>
          <CardDescription>Warehouse / intranet management system.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !version ? (
            <p className="text-sm text-muted-foreground">Loading version information…</p>
          ) : (
            <>
              <div>
                <DetailRow label="Commit">
                  {version.commit_url ? (
                    <a
                      href={version.commit_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-primary hover:underline"
                    >
                      {version.commit_short}
                    </a>
                  ) : (
                    <span className="font-mono">{version.commit_short}</span>
                  )}
                </DetailRow>
                <DetailRow label="Branch">{version.branch}</DetailRow>
                <DetailRow label="Build method">{version.build_method}</DetailRow>
                <DetailRow label="Build date">{formatBuildDate(version.build_date)}</DetailRow>
              </div>

              <Button asChild variant="outline">
                <a href={version.github_url} target="_blank" rel="noreferrer">
                  <Github className="mr-2 h-4 w-4" />
                  GitHub repository
                </a>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
