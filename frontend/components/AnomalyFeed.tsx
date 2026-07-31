import type { Anomaly } from '../types';
import { useEffect, useRef } from 'react';

interface Props {
  anomalies: Anomaly[];
}

export function AnomalyFeed({ anomalies }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0; // newest at top
    }
  }, [anomalies.length]);

  if (anomalies.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Recent Anomalies
        </h3>
        <p className="text-gray-600 text-sm italic py-4 text-center">No anomalies detected</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Recent Anomalies
      </h3>
      <div ref={listRef} className="space-y-2 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
        {anomalies.map((a, i) => (
          <div
            key={`${a.target}-${a.timestamp}-${i}`}
            className={`p-2.5 rounded-lg text-xs border ${
              a.reason === 'packet_loss_spike'
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="font-semibold">{a.target}</span>
              <span className="opacity-60">{new Date(a.timestamp * 1000).toLocaleTimeString()}</span>
            </div>
            <div className="mt-1 flex gap-x-3 text-gray-400">
              <span>{a.reason.replace(/_/g, ' ')}</span>
              <span>RTT: {a.avg_rtt.toFixed(1)}ms</span>
              <span>Loss: {a.loss_pct.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}