import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 lg:px-6">
      <Card className="border-destructive/60 bg-destructive/10 text-destructive">
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-destructive/80">
          <p>You do not have permission to view this page.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/">Go to dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/store">Open warehouse</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
