import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Currency {
  id: number
  code: string
  name: string
  rate_to_base: string
  is_base: boolean
  updated_at: string
}

export function CurrenciesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient()
  const [rateDrafts, setRateDrafts] = useState<Record<number, string>>({})
  const [newCurrency, setNewCurrency] = useState({ code: "", name: "", rate: "" })

  const { data: currencies, isLoading } = useQuery<Currency[]>({
    queryKey: ["currencies"],
    queryFn: () => apiFetch<Currency[]>("/api/v1/store/currency/"),
  })

  const baseCode = currencies?.find((currency) => currency.is_base)?.code

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["currencies"] })

  const saveMutation = useMutation({
    mutationFn: ({ id, rate }: { id: number; rate: string }) =>
      apiFetch(`/api/v1/store/currency/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ rate_to_base: rate }),
      }),
    onSuccess: (_data, { id }) => {
      setRateDrafts((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      refresh()
      toast.success("Exchange rate updated.")
    },
    onError: () => toast.error("Failed to update exchange rate."),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/store/currency/", {
        method: "POST",
        body: JSON.stringify({
          code: newCurrency.code.trim(),
          name: newCurrency.name.trim(),
          rate_to_base: newCurrency.rate.trim(),
        }),
      }),
    onSuccess: () => {
      setNewCurrency({ code: "", name: "", rate: "" })
      refresh()
      toast.success("Currency added.")
    },
    onError: () => toast.error("Failed to add currency. Check the code and rate."),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/v1/store/currency/${id}/`, { method: "DELETE" }),
    onSuccess: () => {
      refresh()
      toast.success("Currency deleted.")
    },
    onError: () => toast.error("Failed to delete currency."),
  })

  const canCreate = newCurrency.code.trim() !== "" && Number(newCurrency.rate) > 0

  return (
    <div className={embedded ? "w-full space-y-4" : "mx-auto w-full max-w-4xl space-y-4"}>
      {!embedded && (
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Currencies</h1>
          <p className="text-sm text-muted-foreground">
            Currencies selectable on purchases and their exchange rates.
          </p>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        The rate is the value of 1 unit of the currency in the base currency
        {baseCode ? ` (${baseCode})` : ""}.
      </p>

      <div className="overflow-hidden rounded-lg border border-border/70">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-48">Rate to {baseCode || "base"}</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : (
              (currencies || []).map((currency) => {
                const draft = rateDrafts[currency.id]
                const dirty = draft !== undefined && draft !== currency.rate_to_base
                return (
                  <TableRow key={currency.id}>
                    <TableCell className="font-medium">
                      {currency.code}
                      {currency.is_base && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">
                          Base
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{currency.name}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={draft ?? currency.rate_to_base}
                        disabled={currency.is_base}
                        onChange={(event) =>
                          setRateDrafts((prev) => ({ ...prev, [currency.id]: event.target.value }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && dirty && Number(draft) > 0) {
                            saveMutation.mutate({ id: currency.id, rate: draft })
                          }
                        }}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(currency.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {dirty && (
                        <Button
                          size="sm"
                          className="mr-1"
                          disabled={!(Number(draft) > 0) || saveMutation.isPending}
                          onClick={() => saveMutation.mutate({ id: currency.id, rate: draft })}
                        >
                          Save
                        </Button>
                      )}
                      {!currency.is_base && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${currency.code}`}
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete currency ${currency.code}?`)) {
                              deleteMutation.mutate(currency.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_10rem_auto]">
        <Input
          placeholder="Code (e.g. PLN)"
          value={newCurrency.code}
          maxLength={10}
          onChange={(event) => setNewCurrency((prev) => ({ ...prev, code: event.target.value }))}
        />
        <Input
          placeholder="Name"
          value={newCurrency.name}
          onChange={(event) => setNewCurrency((prev) => ({ ...prev, name: event.target.value }))}
        />
        <Input
          type="number"
          step="any"
          min="0"
          placeholder="Rate"
          value={newCurrency.rate}
          onChange={(event) => setNewCurrency((prev) => ({ ...prev, rate: event.target.value }))}
        />
        <Button onClick={() => createMutation.mutate()} disabled={!canCreate || createMutation.isPending}>
          Add currency
        </Button>
      </div>
    </div>
  )
}
