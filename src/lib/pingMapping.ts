export type PingPointLike = {
  task_id: number
  ts: number
  latency: number | null
  loss?: number
}

export type PingHistoryLike = {
  ping: PingPointLike[]
  probes: Record<string, string>
  loss?: Record<string, number>
}

export type Carrier = "telecom" | "mobile" | "unicom"
export type LatestPing = Partial<Record<Carrier, { latency?: number; loss?: number }>>

const CARRIER_NAMES: [Carrier, string[]][] = [
  ["telecom", ["电信", "中国电信", "telecom", "chinatelecom", "ctcc"]],
  ["mobile", ["移动", "中国移动", "mobile", "chinamobile", "cmcc"]],
  ["unicom", ["联通", "中国联通", "unicom", "chinaunicom", "cucc"]],
]

function carrierOf(name: string): Carrier | null {
  const value = name.trim().toLowerCase()
  return CARRIER_NAMES.find(([, names]) => names.some((part) => value.includes(part)))?.[0] ?? null
}

function averageLoss(points: PingPointLike[]): number {
  if (!points.length) return 0
  return points.reduce((sum, point) => sum + (point.loss ?? 0), 0) / points.length
}

/** Resolve latest latency and average bucket loss for the three carriers. */
export function latestCarrierPings(data: PingHistoryLike): LatestPing {
  const candidates = new Map<Carrier, { ts: number; latency?: number; loss?: number }>()
  for (const [taskId, name] of Object.entries(data.probes ?? {})) {
    const carrier = carrierOf(name)
    if (!carrier) continue
    const id = Number(taskId)
    const taskPoints = data.ping.filter((point) => point.task_id === id)
    const latest = taskPoints.reduce<PingPointLike | null>(
      (current, point) => !current || point.ts > current.ts ? point : current,
      null,
    )
    if (!latest) continue
    const current = candidates.get(carrier)
    if (current && current.ts >= latest.ts) continue
    candidates.set(carrier, {
      ts: latest.ts,
      latency: latest.latency !== null && latest.latency >= 0 ? latest.latency : undefined,
      loss: averageLoss(taskPoints),
    })
  }
  return Object.fromEntries([...candidates].map(([carrier, value]) => [carrier, {
    latency: value.latency,
    loss: value.loss,
  }])) as LatestPing
}

/**
 * Keep a live snapshot value when the history window has no matching probe or
 * the matching probe has no value for one metric. This matters on hubs where
 * probes are configured inconsistently across nodes.
 */
export function mergeCarrierPings(primary: LatestPing, fallback: LatestPing): LatestPing {
  const result: LatestPing = {}
  for (const carrier of ["telecom", "mobile", "unicom"] as const) {
    const current = primary[carrier]
    const backup = fallback[carrier]
    if (!current && !backup) continue
    result[carrier] = {
      latency: current?.latency ?? backup?.latency,
      loss: current?.loss ?? backup?.loss,
    }
  }
  return result
}
