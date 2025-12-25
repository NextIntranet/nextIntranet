import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>The page you are looking for does not exist or is no longer available.</p>
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
