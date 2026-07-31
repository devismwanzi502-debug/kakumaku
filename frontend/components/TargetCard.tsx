import type { TargetState, Snapshot } from '../types';

function StatusDot({ status }: { status: TargetState['status'] }) {
  const cls =
    status === 'up'
      ? 'status-dot status-dot-up'
      : status === 'loss'
        ? 'status-dot status-dot-loss'
        : status === 'latency'
          ? 'status-dot status-dot-latency'
          : 'status-dot status-dot-idle';
  return <span className={cls} />;
}

function rttColor(ms: number): string {
  if (ms <= 20) return 'text-emerald-400';
  if (ms <= 50) return 'text-lime-400';
  if (ms <= 150) return 'text-amber-400';
  return 'text-red-400';
}

function lossColor(pct: number): string {
  if (pct === 0) return 'text-emerald-400';
  if (pct <= 5) return 'text-amber-400';
  return 'text-red-400';
}

interface CardProps {
  target: string;
  state: TargetState;
}

export function TargetCard({ target, state }: CardProps) {
  const s = state.snapshot;
  const status = state.status;
  const anomaly = state.anomaly;

  const glowCls = status === 'up' ? 'glow-green' : status === 'loss' ? 'glow-red' : status === 'latency' ? 'glow-amber' : '';
  const borderCls = status === 'up' ? 'border-emerald-500/40' : status === 'loss' ? 'border-red-500/40' : status === 'latency' ? 'border-amber-500/40' : 'border-gray-700';

  return (
    <div className={`relative bg-gray-900 border ${borderCls} rounded-xl p-5 transition-shadow duration-300 ${glowCls}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-100 truncate">{target}</h3>
        <StatusDot status={status} />
      </div>

      {s ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div className="flex justify-between col-span-2">
            <span className="text-gray-400">Avg RTT</span>
            <span className={`font-mono font-semibold ${rttColor(s.avg_rtt_ms)}`}>
              {s.avg_rtt_ms.toFixed(1)} ms
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Min</span>
            <span className="font-mono text-gray-300">{s.min_rtt_ms.toFixed(1)} ms</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Max</span>
            <span className="font-mono text-gray-300">{s.max_rtt_ms.toFixed(1)} ms</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Jitter</span>
            <span className="font-mono text-gray-300">{s.jitter_ms.toFixed(1)} ms</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Loss</span>
            <span className={`font-mono font-semibold ${lossColor(s.packet_loss_pct)}`}>
              {s.packet_loss_pct.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="text-gray-500">Probes (sent/lost)</span>
            <span className="font-mono text-gray-400">{s.sent}/{s.lost}</span>
          </div>
        </div>
      ) : (
        <p className="text-gray-500 text-sm italic py-4 text-center">Waiting for data...</p>
      )}

      {anomaly && (
        <div className={`mt-3 p-3 rounded-lg text-xs font-medium ${
          anomaly.reason === 'packet_loss_spike'
            ? 'bg-red-500/15 text-red-300 border border-red-500/30'
            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
        }`}>
          <span className="uppercase tracking-wide">{anomaly.reason.replace(/_/g, ' ')}</span>
          <span className="ml-2 opacity-75">{new Date(anomaly.timestamp * 1000).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}