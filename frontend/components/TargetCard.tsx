import { useEffect, useRef, useState, useMemo } from 'react';
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
  if (ms <= 20) return '#34d399';
  if (ms <= 50) return '#84cc16';
  if (ms <= 150) return '#fbbf24';
  return '#f87171';
}

function lossColor(pct: number): string {
  if (pct === 0) return '#34d399';
  if (pct <= 5) return '#fbbf24';
  return '#f87171';
}

function AnimatedValue({ value, suffix = '', formatter = (v: number) => v.toFixed(1), color }: {
  value: number;
  suffix?: string;
  formatter?: (v: number) => string;
  color: string;
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
    <span ref={ref} className="transition-all duration-300" style={{ color }}>
      {formatter(value)}{suffix}
    </span>
  );
}

function CircularGauge({ value, max = 300, color, size = 100, strokeWidth = 6 }: {
  value: number;
  max?: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const offset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} className="transform -rotate-90" style={{ filter: 'drop-shadow(0 0 8px ' + color + '80)' }}>
      <defs>
        <linearGradient id={`gauge-gradient-${color.replace('#', '')}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#1f2937"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={`url(#gauge-gradient-${color.replace('#', '')})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="rtt-bar"
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.4s' }}
      />
    </svg>
  );
}

function Sparkline({ data, color, height = 50 }: {
  data: number[];
  color: string;
  height?: number;
}) {
  if (!data.length) return null;
  const maxVal = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - (v / maxVal) * 90;
    return `${x}%,${y}%`;
  }).join(' ');

  return (
    <svg width="100%" height={height} className="w-full">
      <defs>
        <linearGradient id="sparkline-gradient" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="100%" stopColor={color} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,100 ${points} 100%,100`}
        fill="url(#sparkline-gradient)"
        opacity="0.3"
      />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="rtt-bar"
        style={{ filter: 'drop-shadow(0 0 4px ' + color + ')' }}
      />
    </svg>
  );
}

function PingAnimation({ active, color }: { active: boolean; color: string }) {
  if (!active) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="ping-ring" style={{ color, width: '60px', height: '60px', animationDuration: '1.5s' }} />
      <div className="ping-ring" style={{ color, width: '60px', height: '60px', animationDuration: '1.5s', animationDelay: '0.75s' }} />
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
  const [history, setHistory] = useState<number[]>([]);
  const [showGauge, setShowGauge] = useState(false);

  const glowCls =
    status === 'up' ? 'glow-green' :
    status === 'loss' ? 'glow-red' :
    status === 'latency' ? 'glow-amber' : '';

  const borderCls =
    status === 'up' ? 'border-emerald-500/40' :
    status === 'loss' ? 'border-red-500/40' :
    status === 'latency' ? 'border-amber-500/40' : 'border-gray-700';

  const statusColor =
    status === 'up' ? '#34d399' :
    status === 'loss' ? '#f87171' :
    status === 'latency' ? '#fbbf24' : '#6b7280';

  // Update history on snapshot change
  useEffect(() => {
    if (s) {
      setHistory(prev => [...prev.slice(-59), s.avg_rtt_ms]);
    }
  }, [s?.avg_rtt_ms]);

  // Trigger gauge animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setShowGauge(true), index * 80 + 100);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div
      ref={cardRef}
      className={`relative bg-gray-900/80 backdrop-blur border ${borderCls} rounded-2xl p-5 transition-all duration-500 hover:scale-[1.02] hover:border-opacity-80 card-enter scale-pulse ${glowCls} glow-pulse`}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/* Subtle animated background wave */}
      <div className="wave-bg" style={{ color: statusColor }} />

      {/* Ping animation when data arrives */}
      <PingAnimation active={!!s} color={statusColor} />

      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <StatusDot status={status} />
            <div className="radar-sweep absolute inset-0" style={{ color: statusColor }} />
          </div>
          <h3 className="text-lg font-semibold text-gray-100 truncate max-w-[180px]">{target}</h3>
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full transition-all duration-300 ${
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
        <div className="relative space-y-4" style={{ opacity: showGauge ? 1 : 0, transform: showGauge ? 'translateY(0)' : 'translateY(10px)', transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          {/* Circular Gauge + Main Metric */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-shrink-0">
              <CircularGauge value={s.avg_rtt_ms} max={300} color={statusColor} size={88} strokeWidth={5} />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <AnimatedValue
                    value={s.avg_rtt_ms}
                    formatter={v => v.toFixed(0)}
                    color={statusColor}
                  />
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">ms</div>
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-end mb-2">
                <span className="text-gray-400 text-xs uppercase tracking-wider">Avg RTT</span>
                <span className="text-lg font-mono font-bold tabular-nums" style={{ color: statusColor }}>
                  <AnimatedValue value={s.avg_rtt_ms} suffix=" ms" color={statusColor} />
                </span>
              </div>

              {/* Sparkline */}
              <div className="h-16 relative">
                <Sparkline data={history} color={statusColor} height={50} />
                {history.length > 1 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-currentColor to-transparent opacity-10" style={{ color: statusColor }} />
                )}
              </div>

              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                  <span>Live</span>
                </span>
                <span>Probes: <span className="font-mono text-gray-300">{s.sent}</span></span>
              </div>
            </div>
          </div>

          {/* Metric Grid */}
          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-800/50">
            <MetricBox
              label="Min"
              value={s.min_rtt_ms}
              suffix="ms"
              color={statusColor}
              index={0}
            />
            <MetricBox
              label="Max"
              value={s.max_rtt_ms}
              suffix="ms"
              color={statusColor}
              index={1}
            />
            <MetricBox
              label="Jitter"
              value={s.jitter_ms}
              suffix="ms"
              color={statusColor}
              index={2}
            />
            <MetricBox
              label="Loss"
              value={s.packet_loss_pct}
              suffix="%"
              color={lossColor(s.packet_loss_pct)}
              index={3}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3 py-3" style={{ opacity: showGauge ? 1 : 0, transition: 'opacity 0.5s' }}>
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-16 w-full rounded-lg" />
          <div className="grid grid-cols-4 gap-2">
            <div className="skeleton h-16 rounded-lg" />
            <div className="skeleton h-16 rounded-lg" />
            <div className="skeleton h-16 rounded-lg" />
            <div className="skeleton h-16 rounded-lg" />
          </div>
        </div>
      )}

      {anomaly && (
        <div className={`mt-4 p-3 rounded-xl text-xs font-medium anom-banner relative overflow-hidden ${
          anomaly.reason === 'packet_loss_spike'
            ? 'bg-red-500/15 text-red-300 border border-red-500/30'
            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
        }`}>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-currentColor/10 to-transparent" style={{ color: anomaly.reason === 'packet_loss_spike' ? '#f87171' : '#fbbf24' }} />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: anomaly.reason === 'packet_loss_spike' ? '#f87171' : '#fbbf24' }} />
              <span className="uppercase tracking-wider font-semibold">{anomaly.reason.replace(/_/g, ' ')}</span>
            </div>
            <span className="opacity-60 tabular-nums">{new Date(anomaly.timestamp * 1000).toLocaleTimeString()}</span>
          </div>
          <div className="mt-1.5 flex gap-x-4 text-xs opacity-80">
            <span>RTT: {anomaly.avg_rtt.toFixed(1)}ms</span>
            <span>Loss: {anomaly.loss_pct.toFixed(1)}%</span>
            <span>Baseline: {anomaly.baseline_avg_rtt.toFixed(1)}ms</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, suffix, color, index }: {
  label: string;
  value: number;
  suffix: string;
  color: string;
  index: number;
}) {
  return (
    <div
      className="relative flex flex-col items-center bg-gray-800/50 rounded-xl p-3 transition-all duration-300 hover:bg-gray-800/80 scale-pulse card-enter"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <span className="text-[9px] text-gray-500 uppercase tracking-widest mb-1.5">{label}</span>
      <AnimatedValue value={value} suffix={suffix} color={color} formatter={v => v.toFixed(1)} />
      <div className="w-full h-0.5 mt-2 rounded-full bg-gray-700 overflow-hidden">
        <div className="rtt-bar h-full rounded-full" style={{ width: `${Math.min(value / (suffix === '%' ? 20 : 200) * 100, 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}