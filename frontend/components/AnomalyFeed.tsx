import type { Anomaly } from '../types';
import { useEffect, useRef, useState } from 'react';

interface Props {
  anomalies: Anomaly[];
}

function AnomalyItem({ anomaly, index }: { anomaly: Anomaly; index: number }) {
  const isLoss = anomaly.reason === 'packet_loss_spike';

  return (
    <div
      className={`p-2.5 rounded-lg text-xs border transition-all duration-300 hover:scale-[1.02] anom-item ${
        isLoss
          ? 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/15'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/15'
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${isLoss ? 'bg-red-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
          <span className="font-semibold">{anomaly.target}</span>
        </div>
        <span className="opacity-50 tabular-nums">{new Date(anomaly.timestamp * 1000).toLocaleTimeString()}</span>
      </div>
      <div className="mt-1 flex gap-x-3 text-gray-400">
        <span className="uppercase tracking-wider text-[10px] font-semibold">
          {anomaly.reason.replace(/_/g, ' ')}
        </span>
        <span>RTT: {anomaly.avg_rtt.toFixed(1)}ms</span>
        <span>Loss: {anomaly.loss_pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function AnomalyFeed({ anomalies }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  if (anomalies.length === 0) {
    return (
      <div className="bg-gray-900/80 backdrop-blur border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          Recent Anomalies
        </h3>
        <div className="flex flex-col items-center py-6 text-gray-600">
          <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs italic">All clear</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
        Recent Anomalies
        <span className="ml-auto text-xs font-bold text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{anomalies.length}</span>
      </h3>
      <div ref={listRef} className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {anomalies.map((a, i) => (
          <AnomalyItem key={`${a.target}-${a.timestamp}-${i}`} anomaly={a} index={i} />
        ))}
      </div>
    </div>
  );
}