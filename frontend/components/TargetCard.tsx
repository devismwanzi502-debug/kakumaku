import { useEffect, useRef, useState } from 'react';
import type { TargetState } from '../types';

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

function AnimatedValue({ value, suffix = '', formatter = (v: number) => v.toFixed(1) }: {
  value: number;
  suffix?: string;
  formatter?: (v: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.classList.remove('animate-flash');
    if (value !== prev.current) {
      void ref.current.offsetWidth;
      ref.current.classList.add('animate-flash');
    }
    prev.current = value;
  }, [value]);

  return (
    <span ref={ref} className="transition-all duration-300">
      {formatter(value)}{suffix}
    </span>
  );
}

function RttBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value <= 20 ? '#34d399' : value <= 50 ? '#a3e635' : value <= 150 ? '#fbbf24' : '#f87171';

  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
      <div
        className="rtt-bar h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

interface CardProps {
  target: string;
  state: TargetState;
  index: number;
}

export function TargetCard({ target, state, index }: CardProps) {
  const s = state.snapshot;
  const status = state.status;
  const anomaly = state.anomaly;
  const cardRef = useRef<HTMLDivElement>(null);

  const glowCls =
    status === 'up' ? 'glow-green' :
    status === 'loss' ? 'glow-red' :
    status === 'latency' ? 'glow-amber' : '';

  const borderCls =
    status === 'up' ? 'border-emerald-500/40' :
    status === 'loss' ? 'border-red-500/40' :
    status === 'latency' ? 'border-amber-500/40' : 'border-gray-700';

  return (
    <div
      ref={cardRef}
      className={`relative bg-gray-900/80 backdrop-blur border ${borderCls} rounded-xl p-5 transition-all duration-500 hover:scale-[1.02] hover:border-opacity-80 card-enter ${glowCls}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <h3 className="text-lg font-semibold text-gray-100 truncate">{target}</h3>
        </div>
        <span
          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full transition-colors duration-300 ${
            status === 'up' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
            status === 'loss' ? 'bg-red-500/15 text-red-400 border border-red-500/30' :
            status === 'latency' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
            'bg-gray-700 text-gray-400 border border-gray-600'
          }`}
        >
          {status.toUpperCase()}
        </span>
      </div>

      {s ? (
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <span className="text-gray-400 text-xs uppercase tracking-wide">Avg RTT</span>
            <span className={`text-lg font-mono font-bold ${rttColor(s.avg_rtt_ms)}`}>
              <AnimatedValue value={s.avg_rtt_ms} suffix=" ms" />
            </span>
          </div>

          <RttBar value={s.avg_rtt_ms} max={300} />

          <div className="grid grid-cols-4 gap-2 mt-3">
            <div className="flex flex-col items-center bg-gray-800/50 rounded-lg p-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Min</span>
              <span className="font-mono text-xs text-gray-300 mt-0.5">
                <AnimatedValue value={s.min_rtt_ms} suffix="ms" />
              </span>
            </div>
            <div className="flex flex-col items-center bg-gray-800/50 rounded-lg p-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Max</span>
              <span className="font-mono text-xs text-gray-300 mt-0.5">
                <AnimatedValue value={s.max_rtt_ms} suffix="ms" />
              </span>
            </div>
            <div className="flex flex-col items-center bg-gray-800/50 rounded-lg p-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Jitter</span>
              <span className="font-mono text-xs text-gray-300 mt-0.5">
                <AnimatedValue value={s.jitter_ms} suffix="ms" />
              </span>
            </div>
            <div className="flex flex-col items-center bg-gray-800/50 rounded-lg p-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Loss</span>
              <span className={`font-mono text-xs font-semibold mt-0.5 ${lossColor(s.packet_loss_pct)}`}>
                <AnimatedValue value={s.packet_loss_pct} suffix="%" />
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 py-3">
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-2 w-full rounded" />
          <div className="grid grid-cols-4 gap-2">
            <div className="skeleton h-10 rounded-lg" />
            <div className="skeleton h-10 rounded-lg" />
            <div className="skeleton h-10 rounded-lg" />
            <div className="skeleton h-10 rounded-lg" />
          </div>
        </div>
      )}

      {anomaly && (
        <div className={`mt-3 p-3 rounded-lg text-xs font-medium anom-banner ${
          anomaly.reason === 'packet_loss_spike'
            ? 'bg-red-500/15 text-red-300 border border-red-500/30'
            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
        }`}>
          <div className="flex items-center justify-between">
            <span className="uppercase tracking-wide font-semibold">{anomaly.reason.replace(/_/g, ' ')}</span>
            <span className="opacity-60">{new Date(anomaly.timestamp * 1000).toLocaleTimeString()}</span>
          </div>
          <div className="mt-1 flex gap-x-3 text-xs opacity-80">
            <span>RTT: {anomaly.avg_rtt.toFixed(1)}ms</span>
            <span>Loss: {anomaly.loss_pct.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}