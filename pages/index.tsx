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

function ConnectionIndicator({ connected }: { connected: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
      connected
        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 live-badge'
        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
    }`}>
      <span className="relative flex h-2 w-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
          connected ? 'bg-emerald-400' : 'bg-amber-400'
        } opacity-75`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${
          connected ? 'bg-emerald-500' : 'bg-amber-500'
        }`} />
      </span>
      {connected ? 'LIVE' : 'CONNECTING...'}
    </span>
  );
}

function SummaryCard({ label, value, color, icon, delay = 0 }: {
  label: string;
  value: number;
  color: 'emerald' | 'amber' | 'gray';
  icon: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className={`bg-gray-900/80 backdrop-blur border rounded-xl p-4 text-center transition-all duration-500 hover:scale-[1.02] hover:border-opacity-80 counter-in ${
        color === 'emerald' ? 'border-emerald-500/30' :
        color === 'amber' ? 'border-amber-500/30' :
        'border-gray-700'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className={`text-${color}-400`}>{icon}</span>
      </div>
      <div className={`text-3xl font-bold text-${color}-400 tabular-nums transition-all duration-500`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold text-gray-100 tracking-tight header-line inline-block pb-3">
        Network Pulse
      </h1>
      <p className="text-gray-400 mt-1 text-sm max-w-md">
        Real-time latency & packet loss monitor
      </p>
    </div>
  );
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

  const isConnected = Object.keys(sseState.targets).length > 0 || sseState.recentAnomalies.length > 0;

  return (
    <>
      <Head>
        <title>Network Pulse — Real-Time Latency & Packet Loss Monitor</title>
        <meta name="description" content="Live network telemetry dashboard with anomaly detection" />
      </Head>

      <div className="min-h-screen bg-gray-950 bg-grid">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <Header />
            <ConnectionIndicator connected={isConnected} />
          </div>

          {/* Summary bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <SummaryCard
              label="Healthy"
              value={totalUp}
              color="emerald"
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              delay={0}
            />
            <SummaryCard
              label="Degraded"
              value={totalDegraded}
              color="amber"
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>}
              delay={60}
            />
            <SummaryCard
              label="No Data"
              value={totalIdle}
              color="gray"
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M10.5 14.5a3 3 0 014.242 0M13 12a1.5 1.5 0 012.5 1M12 20v.01M12 8V4m-8 8h.01M20 12h.01" /></svg>}
              delay={120}
            />
          </div>

          {/* Target grid + anomaly sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              {targetList.length === 0 ? (
                <div className="bg-gray-900/80 backdrop-blur border border-gray-800 rounded-xl p-12 text-center card-enter">
                  <div className="text-gray-600 mb-3">
                    <svg className="w-14 h-14 mx-auto opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M10.5 14.5a3 3 0 014.242 0M13 12a1.5 1.5 0 012.5 1M12 20v.01M12 8V4m-8 8h.01M20 12h.01" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm max-w-md mx-auto">
                    Waiting for telemetry data. Ensure the daemon is running and sending data to the API server.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {targetList.map(([target, state], i) => (
                    <TargetCard key={target} target={target} state={state} index={i} />
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-1">
              <AnomalyFeed anomalies={anomalies} />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-10 text-center text-xs text-gray-600 border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <span>Network Pulse</span>
            <span className="text-gray-700">|</span>
            <span>Python daemon + Node.js API + Next.js</span>
          </div>
        </div>
      </div>
    </>
  );
}