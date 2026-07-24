export const IBOM_EVENT_TYPES = {
  HOVER: 'ibom.hover',
  HIGHLIGHT: 'ibom.highlight',
  CHECKBOX: 'ibom.checkbox',
  SOURCED: 'ibom.sourced',
  BARCODE: 'ibom.barcode',
  SYNC: 'ibom.sync',
  READY: 'ibom.ready',
  REQUEST_STATE: 'ibom.request_state',
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

export interface IbomStateResponse {
  template_id: string;
  qty_planned: number;
  components: {
    id: string;
    refs: string[];
    value: string;
    footprint: string;
    sourced_total: number;
    placed_total: number;
    qty_per_board: number;
    dnp: boolean;
    exclude_from_bom: boolean;
  }[];
}
