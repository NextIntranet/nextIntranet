import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface UserMe {
  id: string
  username: string
}

export function ProfileRedirectPage() {
  const navigate = useNavigate()

  const { data: user, isLoading, error } = useQuery<UserMe>({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/v1/me/"),
  })

  useEffect(() => {
    if (user?.id) {
      navigate(`/user/${user.id}`, { replace: true })
    }
  }, [navigate, user?.id])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 lg:px-6">
        <Card>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-2/3" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 lg:px-6">
        <Card className="border-destructive/60 bg-destructive/10 text-destructive">
          <CardHeader>
            <CardTitle>Unable to load profile</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-destructive/80">
            Please refresh the page or try again later.
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
