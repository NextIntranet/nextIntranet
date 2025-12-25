import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { ForbiddenPage } from "@/pages/ForbiddenPage"
import { NotFoundPage } from "@/pages/NotFoundPage"

interface UserAccessPermission {
  id: string
  area: string
  level: string
}

interface UserAdmin {
  id: string
  username: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  is_active: boolean
  is_staff: boolean
  is_superuser: boolean
  access_permissions?: UserAccessPermission[]
}

interface UserMe {
  id: string
  is_superuser: boolean
  access_permissions: UserAccessPermission[]
}

const getRoleLabel = (user: UserAdmin) => {
  if (user.is_superuser) return "Superuser"
  if (user.is_staff) return "Staff"
  return "User"
}

const permissionLevels = ["guest", "read", "write", "admin"]
const permissionRank: Record<string, number> = {
  guest: 1,
  read: 2,
  write: 3,
  admin: 4,
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [formState, setFormState] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    is_active: false,
    is_staff: false,
    is_superuser: false,
    access_permissions: [] as Array<{ area: string; level: string }>,
  })

  const { data: user, isLoading, error } = useQuery<UserAdmin>({
    queryKey: ["user", id],
    queryFn: () => apiFetch<UserAdmin>(`/api/v1/core/users/${id}/`),
    enabled: !!id,
  })

  const { data: me } = useQuery<UserMe>({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/v1/me/"),
  })

  useEffect(() => {
    if (!user) {
      return
    }
    setFormState({
      username: user.username || "",
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      is_active: user.is_active,
      is_staff: user.is_staff,
      is_superuser: user.is_superuser,
      access_permissions:
        user.access_permissions?.map((permission) => ({
          area: permission.area,
          level: permission.level,
        })) || [],
    })
  }, [user])

  const isSelf = !!me?.id && !!id && String(me.id) === String(id)
  const userPermission = me?.access_permissions?.find((permission) => permission.area === "user")
  const permissionLevel = userPermission?.level
  const hasUserRead =
    permissionLevel && permissionRank[permissionLevel] >= permissionRank.read
  const canEdit =
    me?.is_superuser ||
    me?.access_permissions?.some(
      (permission) =>
        permission.area === "user" && ["write", "admin"].includes(permission.level),
    )

  const fullName = useMemo(() => {
    if (!user) return "-"
    return [user.first_name, user.last_name].filter(Boolean).join(" ") || "-"
  }, [user])

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<UserAdmin>) =>
      apiFetch(`/api/v1/core/users/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", id] })
      queryClient.invalidateQueries({ queryKey: ["users"] })
      setEditOpen(false)
      toast.success("User updated.")
    },
    onError: () => {
      toast.error("Failed to update user.")
    },
  })

  const handleSave = () => {
    const cleanedPermissions = formState.access_permissions
      .map((permission) => ({
        area: permission.area.trim(),
        level: permission.level.trim(),
      }))
      .filter((permission) => permission.area && permission.level)

    updateMutation.mutate({
      username: formState.username.trim(),
      first_name: formState.first_name.trim() || null,
      last_name: formState.last_name.trim() || null,
      email: formState.email.trim() || null,
      is_active: formState.is_active,
      is_staff: formState.is_staff,
      is_superuser: formState.is_superuser,
      access_permissions: cleanedPermissions as UserAccessPermission[],
    })
  }

  if (isLoading || !me) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Card>
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-6 w-1/3" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!isSelf && !me.is_superuser && (!permissionLevel || permissionLevel === "guest")) {
    return <NotFoundPage />
  }

  if (!isSelf && !me.is_superuser && !hasUserRead) {
    return <ForbiddenPage />
  }

  if (error || !user) {
    return <NotFoundPage />
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">{user.username}</h1>
          <p className="text-sm text-muted-foreground">User details and permissions.</p>
        </div>
        {canEdit && (
          <Button onClick={() => setEditOpen(true)} className="w-full sm:w-auto">
            Edit profile
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
              <span className="text-muted-foreground">Full name</span>
              <span className="font-medium text-foreground">{fullName}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium text-foreground">{user.email || "-"}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium text-foreground">{getRoleLabel(user)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
              <span className="text-muted-foreground">Active</span>
              <span className="font-medium text-foreground">{user.is_active ? "Yes" : "No"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access permissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {user.access_permissions && user.access_permissions.length > 0 ? (
              user.access_permissions.map((permission) => (
                <div
                  key={permission.id}
                  className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3"
                >
                  <span className="text-muted-foreground">{permission.area}</span>
                  <span className="font-medium text-foreground">{permission.level}</span>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 px-4 py-3 text-muted-foreground">
                No permissions assigned.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {canEdit && (
        <Sheet open={editOpen} onOpenChange={setEditOpen}>
          <SheetContent side="right" className="w-full max-w-lg">
            <SheetHeader>
              <SheetTitle>Edit user</SheetTitle>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Username</label>
                  <Input
                    value={formState.username}
                    onChange={(e) =>
                      setFormState({ ...formState, username: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <Input
                    value={formState.email}
                    onChange={(e) =>
                      setFormState({ ...formState, email: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">First name</label>
                  <Input
                    value={formState.first_name}
                    onChange={(e) =>
                      setFormState({ ...formState, first_name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Last name</label>
                  <Input
                    value={formState.last_name}
                    onChange={(e) =>
                      setFormState({ ...formState, last_name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Account status</label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={formState.is_active ? "default" : "outline"}
                    aria-pressed={formState.is_active}
                    onClick={() =>
                      setFormState({ ...formState, is_active: !formState.is_active })
                    }
                  >
                    Active
                  </Button>
                  <Button
                    type="button"
                    variant={formState.is_staff ? "default" : "outline"}
                    aria-pressed={formState.is_staff}
                    onClick={() =>
                      setFormState({ ...formState, is_staff: !formState.is_staff })
                    }
                  >
                    Staff
                  </Button>
                  <Button
                    type="button"
                    variant={formState.is_superuser ? "default" : "outline"}
                    aria-pressed={formState.is_superuser}
                    onClick={() =>
                      setFormState({ ...formState, is_superuser: !formState.is_superuser })
                    }
                  >
                    Superuser
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-foreground">
                    Access permissions
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setFormState({
                        ...formState,
                        access_permissions: [
                          ...formState.access_permissions,
                          { area: "", level: "read" },
                        ],
                      })
                    }
                  >
                    Add permission
                  </Button>
                </div>
                <div className="space-y-2">
                  {formState.access_permissions.length > 0 ? (
                    formState.access_permissions.map((permission, index) => (
                      <div key={`${permission.area}-${index}`} className="flex gap-2">
                        <Input
                          value={permission.area}
                          onChange={(e) => {
                            const next = [...formState.access_permissions]
                            next[index] = { ...next[index], area: e.target.value }
                            setFormState({ ...formState, access_permissions: next })
                          }}
                          placeholder="Area"
                        />
                        <select
                          value={permission.level}
                          onChange={(e) => {
                            const next = [...formState.access_permissions]
                            next[index] = { ...next[index], level: e.target.value }
                            setFormState({ ...formState, access_permissions: next })
                          }}
                          className="h-10 w-36 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {permissionLevels.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            const next = formState.access_permissions.filter(
                              (_, i) => i !== index,
                            )
                            setFormState({ ...formState, access_permissions: next })
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-border/70 px-3 py-2 text-sm text-muted-foreground">
                      No permissions assigned.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
