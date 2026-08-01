export const IBOM_EVENT_TYPES = {
  HOVER: 'ibom.hover',
  HIGHLIGHT: 'ibom.highlight',
  CHECKBOX: 'ibom.checkbox',
  SOURCED: 'ibom.sourced',
  BARCODE: 'ibom.barcode',
  SYNC: 'ibom.sync',
  READY: 'ibom.ready',
  REQUEST_STATE: 'ibom.request_state',
  GROUPING: 'ibom.grouping',
} as const;

export type IbomEventType = (typeof IBOM_EVENT_TYPES)[keyof typeof IBOM_EVENT_TYPES];

export interface IbomHoverPayload {
  refs: [string, number][] | null;
  net: string | null;
  rowid: string;
}

export interface IbomHighlightPayload {
  ref: string;
}

export interface IbomCheckboxPayload {
  checkbox: string;
  refs: [string, number][];
  state: 'checked' | 'unchecked';
  templateId: string;
}

export interface IbomSourcedPayload {
  checkbox: string;
  ref: string;
  state: boolean;
}

export interface IbomBarcodePayload {
  ref: string;
  autoCheck: boolean;
  checkbox?: string;
}

export interface IbomSyncPayload {
  checkbox: string;
  refs: Record<string, boolean>;
}

export interface IbomReadyPayload {
  templateId: string;
  footprints: { index: number; ref: string; layer: string }[];
}

/**
 * One designator's worth of grouping data for the iBOM page. The bridge merges
 * these by `ref` and rebuilds the BOM rows so they mirror our BOM lines instead
 * of the generator's Value+Footprint+UST_ID merge.
 */
export interface IbomGroupingItem {
  ref: string;
  line_id: string;
  part: string;
  stock?: number | null;
  needed?: number | null;
  shortage?: boolean | null;
  location?: string | null;
}

export interface IbomGroupingPayload {
  templateId: string;
  generated?: string;
  /** True for an incremental merge; a full push (the default) replaces the map. */
  patch?: boolean;
  items: IbomGroupingItem[];
}

export interface IbomStateLine {
  id: string;
  refs: string[];
  value: string;
  footprint: string;
  sourced_total: number;
  placed_total: number;
  qty_per_board: number;
  dnp: boolean;
  exclude_from_bom: boolean;
  component_id: string | null;
  component_name: string | null;
  /** Present only when the endpoint is called with `?stock=1`. */
  in_stock?: number;
  needed_total?: number;
  shortage?: boolean;
  total_in_home?: number | null;
  location?: string | null;
}

export interface IbomStateResponse {
  template_id: string;
  qty_planned: number;
  generated?: string;
  components: IbomStateLine[];
}
