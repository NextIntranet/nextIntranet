import { Link } from "react-router-dom"
import { Cpu } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function SettingsPage() {
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
      </div>
    </div>
  )
}
