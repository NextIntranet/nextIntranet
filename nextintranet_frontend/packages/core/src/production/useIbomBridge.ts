import { useCallback, useEffect, useRef, useState } from 'react';
import { getRealtimeClient, useRealtimeMessages } from '../realtime/hooks';
import { apiFetch } from '../api/client';
import type { RealtimeEvent } from '../realtime/client';
import {
  IBOM_EVENT_TYPES,
  type IbomHoverPayload,
  type IbomCheckboxPayload,
  type IbomReadyPayload,
} from './ibom-events';

export interface UseIbomBridgeReturn {
  highlightInIbom: (ref: string) => void;
  markSourced: (ref: string, state: boolean) => void;
  sendBarcodeScan: (ref: string, autoCheck: boolean) => void;
  ibomConnected: boolean;
  highlightedRefs: string[] | null;
}

export function useIbomBridge(templateId: string | null): UseIbomBridgeReturn {
  const [ibomConnected, setIbomConnected] = useState(false);
  const [highlightedRefs, setHighlightedRefs] = useState<string[] | null>(null);
  const templateIdRef = useRef(templateId);
  templateIdRef.current = templateId;

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
        break;
      }
    }
  }, []);

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
    ibomConnected,
    highlightedRefs,
  };
}
