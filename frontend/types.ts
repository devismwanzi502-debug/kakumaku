export type Snapshot = {
  target: string;
  timestamp: number;
  avg_rtt_ms: number;
  min_rtt_ms: number;
  max_rtt_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
  sent: number;
  lost: number;
};

export type Anomaly = {
  type: 'anomaly';
  target: string;
  reason: string;
  loss_pct: number;
  avg_rtt: number;
  baseline_avg_rtt: number;
  timestamp: number;
};

export type TargetState = {
  snapshot: Snapshot | null;
  status: 'up' | 'loss' | 'latency' | 'idle';
  anomaly: Anomaly | null;
};

export type DashboardState = {
  targets: Record<string, TargetState>;
  recentAnomalies: Anomaly[];
};

export function classifyStatus(snap: Snapshot | null): TargetState['status'] {
  if (!snap) return 'idle';
  if (snap.packet_loss_pct > 5) return 'loss';
  if (snap.avg_rtt_ms > 200) return 'latency';
  return 'up';
}