import type { Point } from "./history"

export type OfflineRange = {
  since?: number
  until?: number
}

function zeroPoint(ts: number): Point {
  return {
    ts,
    cpu: 0,
    mem_used: 0,
    disk_used: 0,
    net_rx: 0,
    net_tx: 0,
    tcp: 0,
    udp: 0,
  }
}

function inferredStep(points: Point[]): number {
  let step = Infinity
  for (let i = 1; i < points.length; i++) {
    const gap = points[i].ts - points[i - 1].ts
    if (gap > 0) step = Math.min(step, gap)
  }
  return Number.isFinite(step) ? step : 60
}

/**
 * Add explicit zero samples for periods where the hub received no metric report.
 * Real samples remain untouched; only missing time buckets are synthesized.
 */
export function fillOfflineMetrics(points: Point[], stepSeconds?: number, range: OfflineRange = {}): Point[] {
  const sorted = [...points].sort((a, b) => a.ts - b.ts)
  const step = Math.max(1, Math.floor(stepSeconds && stepSeconds > 0 ? stepSeconds : inferredStep(sorted)))
  if (!sorted.length) {
    if (range.since === undefined || range.until === undefined || range.until < range.since) return []
    return [zeroPoint(range.since), zeroPoint(range.until)]
  }

  const result: Point[] = []
  const first = sorted[0]
  if (range.since !== undefined && first.ts > range.since) {
    result.push(zeroPoint(range.since))
    if (first.ts - range.since > step) result.push(zeroPoint(first.ts - step))
  }
  result.push(first)
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]
    const current = sorted[i]
    if (current.ts - previous.ts > step) {
      const firstZero = previous.ts + step
      const lastZero = current.ts - step
      result.push(zeroPoint(firstZero))
      if (lastZero > firstZero) result.push(zeroPoint(lastZero))
    }
    result.push(current)
  }

  if (range.until !== undefined && range.until > sorted[sorted.length - 1].ts) {
    const last = sorted[sorted.length - 1].ts
    const firstZero = Math.min(last + step, range.until)
    result.push(zeroPoint(firstZero))
    if (range.until > firstZero) result.push(zeroPoint(range.until))
  }
  return result
}