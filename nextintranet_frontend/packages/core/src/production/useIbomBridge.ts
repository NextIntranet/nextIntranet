import { useCallback, useEffect, useRef, useState } from 'react';
import { getRealtimeClient, useRealtimeMessages } from '../realtime/hooks';
import { apiFetch } from '../api/client';
import type { RealtimeEvent } from '../realtime/client';
import {
  IBOM_EVENT_TYPES,
  type IbomHoverPayload,
  type IbomCheckboxPayload,
  type IbomReadyPayload,
  type IbomStateResponse,
} from './ibom-events';

export interface IbomCompletionRefs {
  sourced: Record<string, boolean>;
  placed: Record<string, boolean>;
}

export interface UseIbomBridgeReturn {
  highlightInIbom: (ref: string) => void;
  markSourced: (ref: string, state: boolean) => void;
  sendBarcodeScan: (ref: string, autoCheck: boolean) => void;
  syncIbomState: (refs?: IbomCompletionRefs) => Promise<void>;
  ibomConnected: boolean;
  highlightedRefs: string[] | null;
}

function buildCompletionRefsFromState(state: IbomStateResponse): IbomCompletionRefs {
  const sourced: Record<string, boolean> = {};
  const placed: Record<string, boolean> = {};
  const qtyPlanned = Math.max(0, state.qty_planned || 0);

  for (const line of state.components || []) {
    if (line.dnp) continue;
    const refs = Array.isArray(line.refs) ? line.refs : [];
    if (refs.length === 0) continue;

    const needed = Math.max(0, (line.qty_per_board || 0) * qtyPlanned);
    const sourcedDone = needed > 0 && (line.sourced_total || 0) >= needed;
    const placedDone = needed > 0 && (line.placed_total || 0) >= needed;

    for (const ref of refs) {
      if (!ref) continue;
      sourced[ref] = sourcedDone;
      placed[ref] = placedDone;
    }
  }

  return { sourced, placed };
}

function emitIbomSync(refs: IbomCompletionRefs): void {
  const client = getRealtimeClient();
  client.emit({
    type: IBOM_EVENT_TYPES.SYNC,
    payload: { checkbox: 'Sourced', refs: refs.sourced },
  });
  client.emit({
    type: IBOM_EVENT_TYPES.SYNC,
    payload: { checkbox: 'Placed', refs: refs.placed },
  });
}

export function useIbomBridge(templateId: string | null): UseIbomBridgeReturn {
  const [ibomConnected, setIbomConnected] = useState(false);
  const [highlightedRefs, setHighlightedRefs] = useState<string[] | null>(null);
  const templateIdRef = useRef(templateId);
  templateIdRef.current = templateId;
  const syncInFlightRef = useRef(false);

  const syncIbomState = useCallback(async (refs?: IbomCompletionRefs) => {
    const tid = templateIdRef.current;
    if (!tid) return;
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    try {
      let completionRefs = refs;
      if (!completionRefs) {
        const state = await apiFetch<IbomStateResponse>(`/api/v1/production/templates/${tid}/ibom-state/`);
        completionRefs = buildCompletionRefsFromState(state);
      }
      emitIbomSync(completionRefs);
    } catch (err) {
      console.error('[ibom-bridge] sync error:', err);
    } finally {
      syncInFlightRef.current = false;
    }
  }, []);

  const pushStateToIbom = useCallback(
    (refs?: IbomCompletionRefs) => {
      void syncIbomState(refs);
      window.setTimeout(() => {
        void syncIbomState(refs);
      }, 500);
      window.setTimeout(() => {
        void syncIbomState(refs);
      }, 2000);
    },
    [syncIbomState],
  );

  const handleMessage = useCallback((event: RealtimeEvent) => {
    // Ignore only messages from this tab when echoed back (other tabs and osazovák still apply)
    const senderId = (event as RealtimeEvent & { _senderId?: string })._senderId;
    if (senderId && senderId === getRealtimeClient().getSenderId()) return;

    const payload = event.payload as Record<string, unknown>;

    switch (event.type) {
      case IBOM_EVENT_TYPES.HOVER: {
        const hp = payload as unknown as IbomHoverPayload;
        if (hp.refs && Array.isArray(hp.refs)) {
          setHighlightedRefs(hp.refs.map((r) => r[0]));
        } else {
          setHighlightedRefs(null);
        }
        break;
      }

      case IBOM_EVENT_TYPES.CHECKBOX: {
        const cp = payload as unknown as IbomCheckboxPayload;
        const tid = templateIdRef.current;
        if (!tid) break;
        const refNames = (cp.refs || []).map((r) => r[0]);
        apiFetch(`/api/v1/production/templates/${tid}/ibom-event/`, {
          method: 'POST',
          body: JSON.stringify({
            type: 'ibom.checkbox',
            checkbox: cp.checkbox,
            refs: refNames,
            state: cp.state,
          }),
        }).catch((err) => console.error('[ibom-bridge] persist error:', err));
        break;
      }

      case IBOM_EVENT_TYPES.READY: {
        const rp = payload as unknown as IbomReadyPayload;
        const currentTemplateId = templateIdRef.current;
        if (currentTemplateId && rp.templateId && rp.templateId !== currentTemplateId) {
          break;
        }
        setIbomConnected(true);
        pushStateToIbom();
        break;
      }

      case IBOM_EVENT_TYPES.REQUEST_STATE: {
        const requestedTemplateId = payload.templateId as string | undefined;
        const currentTemplateId = templateIdRef.current;
        if (currentTemplateId && requestedTemplateId && requestedTemplateId !== currentTemplateId) {
          break;
        }
        pushStateToIbom();
        break;
      }
    }
  }, [pushStateToIbom]);

  useRealtimeMessages(handleMessage);

  useEffect(() => {
    return () => {
      setIbomConnected(false);
      setHighlightedRefs(null);
    };
  }, [templateId]);

  const highlightInIbom = useCallback(
    (ref: string) => {
      const client = getRealtimeClient();
      client.emit({
        type: IBOM_EVENT_TYPES.HIGHLIGHT,
        payload: { ref },
      });
    },
    [],
  );

  const markSourced = useCallback(
    (ref: string, state: boolean) => {
      const client = getRealtimeClient();
      client.emit({
        type: IBOM_EVENT_TYPES.SOURCED,
        payload: { checkbox: 'Sourced', ref, state },
      });

      const tid = templateIdRef.current;
      if (!tid) return;
      apiFetch(`/api/v1/production/templates/${tid}/ibom-event/`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'ibom.checkbox',
          checkbox: 'Sourced',
          refs: [ref],
          state: state ? 'checked' : 'unchecked',
        }),
      }).catch((err) => console.error('[ibom-bridge] persist error:', err));
    },
    [],
  );

  const sendBarcodeScan = useCallback(
    (ref: string, autoCheck: boolean) => {
      const client = getRealtimeClient();
      client.emit({
        type: IBOM_EVENT_TYPES.BARCODE,
        payload: { ref, autoCheck, checkbox: 'Placed' },
      });

      if (autoCheck) {
        const tid = templateIdRef.current;
        if (!tid) return;
        apiFetch(`/api/v1/production/templates/${tid}/ibom-event/`, {
          method: 'POST',
          body: JSON.stringify({
            type: 'ibom.checkbox',
            checkbox: 'Placed',
            refs: [ref],
            state: 'checked',
          }),
        }).catch((err) => console.error('[ibom-bridge] persist error:', err));
      }
    },
    [],
  );

  return {
    highlightInIbom,
    markSourced,
    sendBarcodeScan,
    syncIbomState,
    ibomConnected,
    highlightedRefs,
  };
}
