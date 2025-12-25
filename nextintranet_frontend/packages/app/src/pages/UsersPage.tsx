import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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

interface PaginatedUsers {
  results: UserAdmin[]
}

interface UserMe {
  is_superuser: boolean
  access_permissions?: UserAccessPermission[]
}

const permissionLevels = ["guest", "read", "write", "admin"]

const getRoleLabel = (user: UserAdmin) => {
  if (user.is_superuser) return "Superuser"
  if (user.is_staff) return "Staff"
  return "User"
}

export function UsersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [formState, setFormState] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    is_active: true,
    is_staff: false,
    is_superuser: false,
    access_permissions: [] as Array<{ area: string; level: string }>,
  })

  const { data: usersData, isLoading } = useQuery<UserAdmin[] | PaginatedUsers>({
    queryKey: ["users"],
    queryFn: () =>
      apiFetch<UserAdmin[] | PaginatedUsers>("/api/v1/core/users/?page_size=1000"),
  })

  const { data: me } = useQuery<UserMe>({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/v1/me/"),
  })

  const canCreate =
    me?.is_superuser ||
    me?.access_permissions?.some(
      (permission) =>
        permission.area === "user" && ["write", "admin"].includes(permission.level),
    )

  const users = Array.isArray(usersData) ? usersData : usersData?.results || []

  const rows = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        fullName: [user.first_name, user.last_name].filter(Boolean).join(" ") || "-",
        role: getRoleLabel(user),
      })),
    [users],
  )

  const createMutation = useMutation({
    mutationFn: (payload: Partial<UserAdmin> & { password?: string }) =>
      apiFetch("/api/v1/core/users/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      setCreateOpen(false)
      setFormState({
        username: "",
        email: "",
        first_name: "",
        last_name: "",
        password: "",
        is_active: true,
        is_staff: false,
        is_superuser: false,
        access_permissions: [],
      })
      toast.success("User created.")
    },
    onError: () => {
      toast.error("Failed to create user.")
    },
  })

  const handleCreate = () => {
    const cleanedPermissions = formState.access_permissions
      .map((permission) => ({
        area: permission.area.trim(),
        level: permission.level.trim(),
      }))
      .filter((permission) => permission.area && permission.level)

    createMutation.mutate({
      username: formState.username.trim(),
      email: formState.email.trim(),
      first_name: formState.first_name.trim() || null,
      last_name: formState.last_name.trim() || null,
      password: formState.password.trim() || undefined,
      is_active: formState.is_active,
      is_staff: formState.is_staff,
      is_superuser: formState.is_superuser,
      access_permissions: cleanedPermissions as UserAccessPermission[],
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground">Browse registered user accounts.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)} className="hidden sm:inline-flex">
            New user
          </Button>
        )}
      </div>

      <div className="mt-4">
        <div className="overflow-hidden rounded-lg border border-border/70">
          <Table className="w-full table-fixed">
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border/50">
                <TableHead className="h-9 w-[28%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Username
                </TableHead>
                <TableHead className="h-9 w-[26%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="h-9 w-[28%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </TableHead>
                <TableHead className="h-9 w-[18%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Role
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="border-border/40">
                  <TableCell colSpan={4} className="py-8">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-1/2" />
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-5 w-2/3" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : rows.length ? (
                rows.map((user) => (
                  <TableRow key={user.id} className="border-border/40">
                    <TableCell className="h-9 px-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/user/${user.id}`)}
                        className="h-7 min-w-0 justify-start px-2 font-normal text-primary hover:underline"
                      >
                        <span className="truncate">{user.username}</span>
                      </Button>
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {user.fullName}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {user.email || "-"}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-foreground">
                      {user.role}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-border/40">
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {canCreate && (
        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetContent side="right" className="w-full max-w-lg">
            <SheetHeader>
              <SheetTitle>New user</SheetTitle>
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
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
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
                <label className="text-sm font-medium text-foreground">Password</label>
                <Input
                  type="password"
                  value={formState.password}
                  onChange={(e) =>
                    setFormState({ ...formState, password: e.target.value })
                  }
                />
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
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create user"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
