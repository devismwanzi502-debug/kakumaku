import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
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

/* ── Particle Background Component ── */
function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Create particles
    const particleCount = Math.min(60, Math.floor((width * height) / 15000));
    particles = Array.from({ length: particleCount }, () => createParticle());

    function createParticle(): Particle {
      const colors = ['#34d399', '#818cf8', '#fbbf24', '#f87171'];
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3 - 0.1,
        radius: Math.random() * 1.5 + 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: Math.random() * 0.4 + 0.1,
        life: 0,
        maxLife: Math.random() * 200 + 100,
      };
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2);
        gradient.addColorStop(0, p.color.replace(')', ', ' + p.opacity + ')').replace('rgb', 'rgba'));
        gradient.addColorStop(1, p.color.replace(')', ', 0)').replace('rgb', 'rgba'));
        ctx.fillStyle = gradient;
        ctx.fill();

        // Reset particle
        if (p.y < -10 || p.x < -10 || p.x > width + 10 || p.life > p.maxLife) {
          Object.assign(p, createParticle());
          p.y = height + 10;
          p.life = 0;
        }
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(52, 211, 153, ${0.05 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current!);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ opacity: 0.4 }}
      aria-hidden="true"
    />
  );
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  opacity: number;
  life: number;
  maxLife: number;
}

/* ── Connection Indicator ── */
function ConnectionIndicator({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex h-8 w-8 items-center justify-center">
        <div className={`absolute inset-0 rounded-full border-2 animate-ping ${connected ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`} />
        <div className={`relative h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'} shadow-[0_0_8px_currentColor]`} />
      </div>
      <span className={`text-xs font-semibold tracking-wide transition-colors ${connected ? 'text-emerald-400' : 'text-amber-400'}`}>
        {connected ? 'LIVE' : 'CONNECTING'}
      </span>
    </div>
  );
}

/* ── Summary Card with Animated Counter ── */
function SummaryCard({ label, value, color, icon, delay = 0, trend }: {
  label: string;
  value: number;
  color: 'emerald' | 'amber' | 'gray';
  icon: React.ReactNode;
  delay?: number;
  trend?: 'up' | 'down' | 'stable';
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (!hasAnimated) {
      const duration = 800;
      const start = Date.now();
      const animate = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayValue(Math.floor(value * eased));
        if (progress < 1) requestAnimationFrame(animate);
        else setHasAnimated(true);
      };
      const timer = setTimeout(animate, delay);
      return () => clearTimeout(timer);
    } else {
      setDisplayValue(value);
    }
  }, [value, delay, hasAnimated]);

  const trendIcon = trend === 'up'
    ? <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
    : trend === 'down'
      ? <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
      : <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" /></svg>;

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-gray-900/90 to-gray-900/60 backdrop-blur border rounded-2xl p-5 text-center transition-all duration-500 hover:scale-[1.02] hover:border-opacity-80 counter-in float ${color === 'emerald' ? 'border-emerald-500/30' : color === 'amber' ? 'border-amber-500/30' : 'border-gray-700'}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Glow accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200%] h-1 bg-gradient-to-r from-transparent via-currentColor to-transparent opacity-30 animate-pulse" style={{ color: color === 'emerald' ? '#34d399' : color === 'amber' ? '#fbbf24' : '#6b7280' }} />

      <div className="relative flex items-center justify-center gap-2 mb-2">
        <span className={`text-${color}-400 drop-shadow-[0_0_8px_currentColor]`}>{icon}</span>
      </div>

      <div className="relative">
        <span className={`text-4xl font-bold tabular-nums text-${color}-400 transition-all duration-500 drop-shadow-[0_0_12px_currentColor]`}>{displayValue.toLocaleString()}</span>
        {trend && (
          <div className="absolute -right-8 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {trendIcon}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 mt-2 uppercase tracking-wider">{label}</div>

      {/* Subtle shimmer overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer-bar" style={{ animationDuration: '3s' }} />
    </div>
  );
}

/* ── Header with animated elements ── */
function Header() {
  return (
    <div className="relative slide-in-left">
      <h1 className="text-4xl font-bold text-gray-100 tracking-tight header-line inline-block pb-4">
        <span className="relative">
          Network Pulse
          <span className="absolute -bottom-2 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-indigo-400 to-amber-400 rounded-full animate-shimmer-bar" style={{ animationDuration: '3s' }} />
        </span>
      </h1>
      <p className="text-gray-400 mt-2 text-sm max-w-md slide-in-left" style={{ animationDelay: '100ms' }}>
        Real-time latency & packet loss monitoring
      </p>
    </div>
  );
}

/* ── Floating action indicator ── */
function StatusPulse({ active, color }: { active: boolean; color: string }) {
  if (!active) return null;
  return (
    <div className="absolute -top-2 -right-2 w-3 h-3 rounded-full animate-ping opacity-75 pointer-events-none" style={{ backgroundColor: color }} />
  );
}

export default function DashboardPage() {
  const sseState = useSSE();
  const initState = useInitialFetch();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

      {/* Particle background */}
      <ParticleBackground />

      <div className="relative min-h-screen bg-gray-950/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
            <Header />
            <ConnectionIndicator connected={isConnected} />
          </div>

          {/* Summary bar with animated counters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 stagger-children">
            <SummaryCard
              label="Healthy"
              value={totalUp}
              color="emerald"
              icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              delay={0}
              trend={totalUp > totalDegraded ? 'up' : totalUp < totalDegraded ? 'down' : 'stable'}
            />
            <SummaryCard
              label="Degraded"
              value={totalDegraded}
              color="amber"
              icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>}
              delay={100}
              trend={totalDegraded > 0 ? 'up' : 'stable'}
            />
            <SummaryCard
              label="No Data"
              value={totalIdle}
              color="gray"
              icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M10.5 14.5a3 3 0 014.242 0M13 12a1.5 1.5 0 012.5 1M12 20v.01M12 8V4m-8 8h.01M20 12h.01" /></svg>}
              delay={200}
              trend="stable"
            />
          </div>

          {/* Target grid + anomaly sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 slide-in-left" style={{ animationDelay: '200ms' }}>
              {targetList.length === 0 ? (
                <div className="relative bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-12 text-center card-enter">
                  <StatusPulse active={!mounted} color="#6b7280" />
                  <div className="relative inline-block mb-4">
                    <svg className="w-16 h-16 mx-auto text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M10.5 14.5a3 3 0 014.242 0M13 12a1.5 1.5 0 012.5 1M12 20v.01M12 8V4m-8 8h.01M20 12h.01" />
                    </svg>
                    <div className="absolute inset-0 rounded-full border-2 border-gray-600/30 animate-ping" />
                  </div>
                  <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
                    Waiting for telemetry data. Ensure the Python daemon is running and sending data to the API server.
                  </p>
                  <div className="mt-6 flex items-center justify-center gap-4 text-xs text-gray-600">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-600" /> SSE: <span className="font-mono">{isConnected ? 'Connected' : 'Connecting...'}</span></span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-600" /> API: <span className="font-mono">/api/health</span></span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
                  {targetList.map(([target, state], i) => (
                    <TargetCard key={target} target={target} state={state} index={i} />
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-1 slide-in-right" style={{ animationDelay: '300ms' }}>
              <AnomalyFeed anomalies={anomalies} />
            </div>
          </div>

          {/* Footer with animated elements */}
          <div className="mt-12 relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
            <div className="text-center text-xs text-gray-600 border-t border-gray-800/50 pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
              <span className="flex items-center gap-2">
                <span className="relative w-5 h-5">
                  <span className="absolute inset-0 rounded-full border border-emerald-400/30 animate-ping" />
                  <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </span>
                Network Pulse
              </span>
              <span className="text-gray-700">|</span>
              <span className="flex items-center gap-2 text-gray-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 16l4-16m-4 0l4 16m-4 0l4-16" /></svg>
                Python daemon + Node.js API + Next.js
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}