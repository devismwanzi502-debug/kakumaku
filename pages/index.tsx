import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useSSE } from '../frontend/hooks/useSSE';
import { TargetCard } from '../frontend/components/TargetCard';
import { AnomalyFeed } from '../frontend/components/AnomalyFeed';

const STATIC_SNAPSHOT_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}/api/snapshots`
    : '';

import type { DashboardState } from '../frontend/types';

function useInitialFetch(): DashboardState | null {
  const [initial, setInitial] = useState<DashboardState | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch(STATIC_SNAPSHOT_URL, { signal: ac.signal })
      .then((r) => r.json())
      .then((data: Record<string, any>) => {
        const targets: DashboardState['targets'] = {};
        for (const tgt of Object.keys(data)) {
          const arr = data[tgt];
          const last = arr[arr.length - 1];
          if (last) {
            targets[tgt] = {
              snapshot: last,
              status: last.packet_loss_pct > 5 ? 'loss' : last.avg_rtt_ms > 200 ? 'latency' : 'up',
              anomaly: null,
            };
          }
        }
        setInitial({ targets, recentAnomalies: [] });
      })
      .catch(() => setInitial({ targets: {}, recentAnomalies: [] }));
    return () => ac.abort();
  }, []);

  return initial;
}

export default function DashboardPage() {
  const sseState = useSSE();
  const initState = useInitialFetch();

  const targets = Object.keys(sseState.targets).length > 0 ? sseState.targets : initState?.targets ?? {};
  const anomalies = sseState.recentAnomalies.length > 0 ? sseState.recentAnomalies : initState?.recentAnomalies ?? [];
  const targetList = Object.entries(targets);
  const totalUp = targetList.filter(([, s]) => s.status === 'up').length;
  const totalDegraded = targetList.filter(([, s]) => s.status === 'loss' || s.status === 'latency').length;
  const totalIdle = targetList.filter(([, s]) => s.status === 'idle').length;

  return (
    <>
      <Head>
        <title>Network Pulse — Real-Time Latency & Packet Loss Monitor</title>
        <meta name="description" content="Live network telemetry dashboard with anomaly detection" />
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-100 tracking-tight">
            Network Pulse
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            Real-time latency &amp; packet loss monitor
          </p>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{totalUp}</div>
            <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">Healthy</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-400">{totalDegraded}</div>
            <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">Degraded</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-gray-500">{totalIdle}</div>
            <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">No Data</div>
          </div>
        </div>

        {/* Target grid + anomaly sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            {targetList.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                <div className="text-gray-600 mb-2">
                  <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M10.5 14.5a3 3 0 014.242 0M13 12a1.5 1.5 0 012.5 1M12 20v.01M12 8V4m-8 8h.01M20 12h.01" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">
                  Waiting for telemetry data. Ensure the daemon is running and sending data to the API server.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {targetList.map(([target, state]) => (
                  <TargetCard key={target} target={target} state={state} />
                ))}
              </div>
            )}
          </div>

          <div>
            <AnomalyFeed anomalies={anomalies} />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-600">
          Network Pulse &mdash; powered by Python daemon + Node.js API + Next.js
        </div>
      </div>
    </>
  );
}