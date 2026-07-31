"""
Real-Time Network Latency & Packet Loss Monitor — Async Daemon
Pings configurable targets, computes rolling jitter/loss stats,
detects anomalies, and pushes telemetry upstream via HTTP.
"""

from __future__ import annotations

import asyncio
import logging
import logging.handlers
import os
import signal
import sys
import time
from collections import deque
from dataclasses import dataclass, field
from typing import NoReturn

import aiohttp
import icmplib
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

TARGETS: list[str] = [
    t.strip() for t in os.getenv("TARGETS", "8.8.8.8,1.1.1.1,example.com").split(",") if t.strip()
]

PING_INTERVAL: float = float(os.getenv("PING_INTERVAL_SEC", "1.0"))
ANOMALY_LOSS_THRESHOLD: float = float(os.getenv("ANOMALY_PACKET_LOSS_THRESHOLD_PCT", "10.0"))
ANOMALY_LATENCY_MULT: float = float(os.getenv("ANOMALY_LATENCY_SPIKE_MULTIPLIER", "2.5"))
METRICS_API_URL: str = os.getenv("METRICS_API_URL", "http://localhost:4000/api/ingest")
ROLLING_WINDOW: int = int(os.getenv("ROLLING_WINDOW_SIZE", "60"))
LOG_FILE: str = os.getenv("LOG_FILE", "/var/log/network-monitor-daemon.log")
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()

# ---------------------------------------------------------------------------
# Logging – syslog-compatible rotating handler
# ---------------------------------------------------------------------------

LOG = logging.getLogger("netmon-daemon")
LOG.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

try:
    handler = logging.handlers.RotatingFileHandler(
        LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=5
    )
except (FileNotFoundError, PermissionError):
    handler = logging.StreamHandler(sys.stdout)

handler.setFormatter(logging.Formatter(
    "%(asctime)s.%(msecs)03d [%(levelname)-5.5s] %(name)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
))
LOG.addHandler(handler)

# ---------------------------------------------------------------------------
# Domain model
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class PingResult:
    target:       str
    timestamp:    float
    rtt_ms:       float
    success:      bool

@dataclass(slots=True)
class TelemetrySnapshot:
    target:          str
    timestamp:       float
    avg_rtt_ms:      float
    min_rtt_ms:      float
    max_rtt_ms:      float
    jitter_ms:       float
    packet_loss_pct: float
    sent:            int
    lost:            int

# ---------------------------------------------------------------------------
# Rolling window helper
# ---------------------------------------------------------------------------

class RollingTelemetry:
    """Fixed-size circular window over recent ping results."""

    __slots__ = ("_buf", "_capacity")

    def __init__(self, capacity: int) -> None:
        self._buf: deque[PingResult] = deque(maxlen=capacity)
        self._capacity = capacity

    @property
    def capacity(self) -> int:
        return self._capacity

    def push(self, result: PingResult) -> None:
        self._buf.append(result)

    def snapshot(self) -> TelemetrySnapshot | None:
        if not self._buf:
            return None
        rtts = [p.rtt_ms for p in self._buf if p.success]
        sent = len(self._buf)
        lost = sum(1 for p in self._buf if not p.success)
        if not rtts:
            return TelemetrySnapshot(
                target=self._buf[-1].target,
                timestamp=time.time(),
                avg_rtt_ms=0.0,
                min_rtt_ms=0.0,
                max_rtt_ms=0.0,
                jitter_ms=0.0,
                packet_loss_pct=round(lost / sent * 100, 2),
                sent=sent,
                lost=lost,
            )

        avg = sum(rtts) / len(rtts)
        jitter = sum(abs(rtts[i] - rtts[i - 1]) for i in range(1, len(rtts))) / len(rtts) if len(rtts) > 1 else 0.0

        return TelemetrySnapshot(
            target=self._buf[-1].target,
            timestamp=time.time(),
            avg_rtt_ms=round(avg, 3),
            min_rtt_ms=round(min(rtts), 3),
            max_rtt_ms=round(max(rtts), 3),
            jitter_ms=round(jitter, 3),
            packet_loss_pct=round(lost / sent * 100, 2),
            sent=sent,
            lost=lost,
        )

# ---------------------------------------------------------------------------
# Ping engine
# ---------------------------------------------------------------------------

class AsyncPinger:
    """Uses icmplib.async_ping to retain async concurrency."""

    @staticmethod
    async def ping(target: str, timeout: float = 2.0) -> PingResult:
        ts = time.monotonic()
        try:
            host = await icmplib.async_ping(target, count=1, timeout=timeout, privileged=False)
        except Exception as exc:
            LOG.warning("ping error for %s: %s", target, exc)
            return PingResult(target=target, timestamp=ts, rtt_ms=0.0, success=False)
        success = host.is_alive
        rtt_ms = float(f"{host.avg_rtt:.3f}") if success else 0.0
        return PingResult(target=target, timestamp=ts, rtt_ms=rtt_ms, success=success)

# ---------------------------------------------------------------------------
# Anomaly detector
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class AnomalyEvent:
    target:  str
    reason:  str
    loss_pct: float
    avg_rtt: float
    baseline_avg_rtt: float
    timestamp: float

class AnomalyDetector:
    """Maintains a long-running baseline for each target."""

    __slots__ = ("loss_threshold", "latency_mult", "baselines", "baseline_samples")

    def __init__(self, loss_threshold: float, latency_mult: float) -> None:
        self.loss_threshold = loss_threshold
        self.latency_mult = latency_mult
        self.baselines: dict[str, float] = {}
        self.baseline_samples: dict[str, deque[float]] = {}

    def feed(self, snap: TelemetrySnapshot) -> list[AnomalyEvent]:
        events: list[AnomalyEvent] = []
        tgt = snap.target

        # update baseline
        if snap.avg_rtt_ms > 0:
            buf = self.baseline_samples.setdefault(tgt, deque(maxlen=300))
            buf.append(snap.avg_rtt_ms)
            self.baselines[tgt] = sum(buf) / len(buf)

        baseline = self.baselines.get(tgt, 0.0)

        if snap.packet_loss_pct > self.loss_threshold:
            events.append(AnomalyEvent(
                target=tgt, reason="packet_loss_spike",
                loss_pct=snap.packet_loss_pct,
                avg_rtt=snap.avg_rtt_ms,
                baseline_avg_rtt=baseline,
                timestamp=snap.timestamp,
            ))

        if baseline > 0 and snap.avg_rtt_ms > baseline * self.latency_mult:
            events.append(AnomalyEvent(
                target=tgt, reason="latency_spike",
                loss_pct=snap.packet_loss_pct,
                avg_rtt=snap.avg_rtt_ms,
                baseline_avg_rtt=baseline,
                timestamp=snap.timestamp,
            ))

        return events

# ---------------------------------------------------------------------------
# HTTP upstream reporter
# ---------------------------------------------------------------------------

class MetricsReporter:
    """Posts snapshots and anomalies to the central API server."""

    def __init__(self, api_url: str, session: aiohttp.ClientSession) -> None:
        self._api = api_url.rstrip("/")
        self._session = session

    async def publish_snapshot(self, snap: TelemetrySnapshot) -> None:
        payload = {
            "type": "snapshot",
            "target": snap.target,
            "timestamp": snap.timestamp,
            "avg_rtt_ms": snap.avg_rtt_ms,
            "min_rtt_ms": snap.min_rtt_ms,
            "max_rtt_ms": snap.max_rtt_ms,
            "jitter_ms": snap.jitter_ms,
            "packet_loss_pct": snap.packet_loss_pct,
            "sent": snap.sent,
            "lost": snap.lost,
        }
        try:
            async with self._session.post(f"{self._api}", json=payload, timeout=aiohttp.ClientTimeout(total=2)) as resp:
                if resp.status >= 400:
                    LOG.error("upstream rejected snapshot %d: %s", resp.status, await resp.text())
        except Exception as exc:
            LOG.error("upstream post failed: %s", exc)

    async def publish_anomaly(self, event: AnomalyEvent) -> None:
        payload = {
            "type": "anomaly",
            "target": event.target,
            "reason": event.reason,
            "loss_pct": event.loss_pct,
            "avg_rtt": event.avg_rtt,
            "baseline_avg_rtt": event.baseline_avg_rtt,
            "timestamp": event.timestamp,
        }
        try:
            async with self._session.post(f"{self._api}", json=payload, timeout=aiohttp.ClientTimeout(total=2)) as resp:
                if resp.status >= 500:
                    LOG.error("upstream anomaly ingest failed %d: %s", resp.status, await resp.text())
        except Exception as exc:
            LOG.error("upstream anomaly post failed: %s", exc)

# ---------------------------------------------------------------------------
# Core orchestrator
# ---------------------------------------------------------------------------

class Daemon:
    def __init__(self) -> None:
        self._pinger = AsyncPinger()
        self._windows: dict[str, RollingTelemetryWindow] = {}
        self._detector = AnomalyDetector(ANOMALY_LOSS_THRESHOLD, ANOMALY_LATENCY_MULT)
        self._session: aiohttp.ClientSession | None = None
        self._reporter: MetricsReporter | None = None
        self._running = False
        self._tasks: list[asyncio.Task[Any]] = []

    async def start(self) -> None:
        self._session = aiohttp.ClientSession()
        self._reporter = MetricsReporter(METRICS_API_URL, self._session)
        self._running = True
        LOG.info("daemon started with targets=%s interval=%.2fs", TARGETS, PING_INTERVAL)
        for tgt in TARGETS:
            self._windows[tgt] = RollingTelemetry(ROLLING_WINDOW)
            self._tasks.append(asyncio.create_task(self._target_loop(tgt), name=f"ping-{tgt}"))
        try:
            await asyncio.gather(*self._tasks)
        except asyncio.CancelledError:
            pass

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        if self._session:
            await self._session.close()
            self._session = None
        LOG.info("daemon shut down cleanly")

    async def _target_loop(self, target: str) -> None:
        window = self._windows[target]
        while self._running:
            try:
                result = await self._pinger.ping(target)
            except Exception as exc:
                LOG.exception("unhandled ping error for %s: %s", target, exc)
                await asyncio.sleep(1)
                continue

            window.push(result)
            snap = window.snapshot()
            if snap is not None and self._reporter:
                await self._reporter.publish_snapshot(snap)

                anomalies = self._detector.feed(snap)
                for anom in anomalies:
                    LOG.warning(
                        "ANOMALY %s/%s loss=%.1f%% rtt=%.1fms baseline=%.1fms",
                        anom.target, anom.reason, anom.loss_pct,
                        anom.avg_rtt, anom.baseline_avg_rtt,
                    )
                    await self._reporter.publish_anomaly(anom)

            await asyncio.sleep(PING_INTERVAL)

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

async def main() -> None:
    daemon = NetDaemon()
    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _handle_signal(sig: signal.Signals) -> None:
        LOG.info("received signal %s, shutting down", sig.name)
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal, sig)
        except NotImplementedError:
            pass

    daemon_task = asyncio.create_task(daemon.start(), name="daemon-core")
    await stop_event.wait()
    daemon_task.cancel()
    try:
        await daemon_task
    except asyncio.CancelledError:
        pass
    await daemon.stop()

if __name__ == "__main__":
    asyncio.run(main())