import { useEffect, useRef, useCallback, useState } from 'react';
import type { Snapshot, Anomaly, DashboardState, TargetState } from '../types';
import { classifyStatus } from '../types';

const SSE_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}/api/stream`
    : '';

export function useSSE() {
  const [state, setState] = useState<DashboardState>({
    targets: {},
    recentAnomalies: [],
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const updateState = useCallback((updater: (prev: DashboardState) => DashboardState) => {
    setState((prev) => updater(prev));
  }, []);

  useEffect(() => {
    if (!SSE_URL) return;

    const es = new EventSource(SSE_URL);

    const handleSnapshot = (e: MessageEvent) => {
      const snap: Snapshot = JSON.parse(e.data);
      updateState((prev) => {
        const existing = prev.targets[snap.target] || { snapshot: null, status: 'idle', anomaly: null };
        const status = classifyStatus(snap);
        const updated: TargetState = { ...existing, snapshot: snap, status };
        return {
          ...prev,
          targets: { ...prev.targets, [snap.target]: updated },
        };
      });
    };

    const handleAnomaly = (e: MessageEvent) => {
      const anom: Anomaly = JSON.parse(e.data);
      updateState((prev) => {
        const existing = prev.targets[anom.target];
        if (existing) {
          prev.targets[anom.target] = { ...existing, anomaly: anom };
        }
        const anoms = [anom, ...prev.recentAnomalies].slice(0, 20);
        return { ...prev, recentAnomalies: anoms };
      });
    };

    es.addEventListener('snapshot', handleSnapshot);
    es.addEventListener('anomaly', handleAnomaly);

    es.onerror = () => {
      es.close();
      setTimeout(() => {
        const retry = new EventSource(SSE_URL);
        retry.addEventListener('snapshot', handleSnapshot);
        retry.addEventListener('anomaly', handleAnomaly);
        retry.onerror = es.onerror;
      }, 3000);
    };

    return () => {
      es.close();
    };
  }, [updateState]);

  return state;
}