import type { Anomaly } from '../types';
import { useEffect, useRef, useState } from 'react';

function AnomalyItem({ anomaly, index }: { anomaly: Anomaly; index: number }) {
  const isLoss = anomaly.reason === 'packet_loss_spike';
  const color = isLoss ? '#f87171' : '#fbbf24';

  return (
    <div
      className={`relative p-3 rounded-xl border transition-all duration-300 hover:scale-[1.02] hover:border-opacity-80 anom-item card-enter`}
      style={{
        animationDelay: `${index * 50}ms`,
        borderColor: `${color}4D`,
        backgroundColor: `${color}10`,
      }}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: color }} />

      {/* Pulse indicator */}
      <div className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />

      <div className="flex justify-between items-start relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="relative w-5 h-5 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ color }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ backgroundColor: color }} />
          </div>
          <span className="font-semibold text-gray-100">{anomaly.target}</span>
        </div>
        <span className="opacity-50 tabular-nums text-xs">{new Date(anomaly.timestamp * 1000).toLocaleTimeString()}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <span
          className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
            isLoss
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}
        >
          {anomaly.reason.replace(/_/g, ' ')}
        </span>
        <span className="flex items-center gap-1 text-gray-400">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          RTT: <span className="font-mono tabular-nums text-gray-200">{anomaly.avg_rtt.toFixed(1)}ms</span>
        </span>
        <span className="flex items-center gap-1 text-gray-400">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
          Loss: <span className="font-mono tabular-nums text-gray-200">{anomaly.loss_pct.toFixed(1)}%</span>
        </span>
      </div>

      {/* Animated progress bar at bottom showing severity */}
      <div className="absolute bottom-0 left-0 h-1 rounded-bl-xl opacity-30" style={{
        width: `${Math.min((isLoss ? anomaly.loss_pct : anomaly.avg_rtt / 5), 100)}%`,
        backgroundColor: color,
      }} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-6 card-enter">
      <div className="text-center">
        <div className="relative inline-block mb-4">
          <svg className="w-12 h-12 mx-auto text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-ping" />
        </div>
        <p className="text-gray-500 text-sm font-medium mb-1">All Systems Nominal</p>
        <p className="text-gray-700 text-xs">No anomalies detected in the last hour</p>
      </div>

      {/* Subtle animated grid in background */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl opacity-5 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] animate-pulse" style={{ animationDuration: '3s' }} />
      </div>
    </div>
  );
}

export function AnomalyFeed({ anomalies }: { anomalies: Anomaly[] }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  // Stagger reveal animation
  useEffect(() => {
    let count = 0;
    const timer = setInterval(() => {
      if (count < anomalies.length) {
        setVisibleCount(c => c + 1);
        count++;
      } else {
        clearInterval(timer);
      }
    }, 80);
    return () => clearInterval(timer);
  }, [anomalies.length]);

  if (anomalies.length === 0) {
    return <EmptyState />;
  }

  const displayAnomalies = anomalies.slice(0, visibleCount);

  return (
    <div className="relative bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-5 card-enter">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </div>
          <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Recent Anomalies</span>
        </div>
        <span className="text-xs font-bold text-gray-500 bg-gray-800 px-2.5 py-1 rounded-full tabular-nums">{anomalies.length}</span>
      </div>

      <div ref={listRef} className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
        {displayAnomalies.map((a, i) => (
          <AnomalyItem key={`${a.target}-${a.timestamp}-${i}`} anomaly={a} index={i} />
        ))}

        {/* Show placeholder for remaining */}
        {visibleCount < anomalies.length && (
          <div className="h-14 bg-gray-800/50 rounded-xl animate-pulse" />
        )}
      </div>

      {/* Bottom fade gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-950 to-transparent pointer-events-none" />
    </div>
  );
}