/** Minimal shape needed to turn a purchase request into a Purchase order item payload. */
export interface RequestForPurchaseItem {
  id: string
  component_id?: string | null
  component_name?: string | null
  quantity: number
  description?: string | null
  mfpn?: string | null
  matching_supplier_relation_id?: string | null
}

/** Builds the `items` payload entry used when linking a purchase request into a Purchase
 * order (`PATCH /api/v1/store/purchase/<id>/`). Returns null when the request has no
 * component or no supplier relation matching the target order's supplier. */
export function purchaseRequestToItem(request: RequestForPurchaseItem): Record<string, unknown> | null {
  if (!request.component_id || !request.matching_supplier_relation_id) {
    return null
  }

  return {
    item_type: "component",
    component_id: request.component_id,
    supplier_relation_id: request.matching_supplier_relation_id,
    requested_quantity: request.quantity,
    quantity: request.quantity,
    package_size: 1,
    symbol: request.mfpn || request.component_name || "",
    description: request.description || "",
  }
}
