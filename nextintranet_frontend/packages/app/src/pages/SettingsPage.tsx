import { Link } from "react-router-dom"
import { Cpu, KeyRound, Laptop, LayoutTemplate } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  setQuickActionsFabVisible,
  useQuickActionsFabVisible,
} from "@/lib/quickActionsFabVisibility"

export function SettingsPage() {
  const quickActionsFabVisible = useQuickActionsFabVisible()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Choose a section to configure your local workspace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>Interface</CardTitle>
            <CardDescription>
              Control optional on-screen shortcuts in the web app.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-row items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="quick-actions-fab">Show quick actions button</Label>
              <p className="text-xs text-muted-foreground">
                Floating menu with camera barcode scan and more.
              </p>
            </div>
            <Switch
              id="quick-actions-fab"
              checked={quickActionsFabVisible}
              onCheckedChange={setQuickActionsFabVisible}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Cpu className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>Hardware</CardTitle>
            <CardDescription>
              Configure scanners, local agents, and station printer preferences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/setting/hardware">Open hardware settings</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>Service tokens</CardTitle>
            <CardDescription>
              Generate and manage personal integration tokens.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/settings/service-token">Open service tokens</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Laptop className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>Software</CardTitle>
            <CardDescription>
              Download integration config files for desktop tools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/settings/software">Open software settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
