export type NqBenchmark = {
  single_core: number | null
  multi_core: number | null
  geekbench5_single: number | null
  geekbench5_multi: number | null
  random4k_single_read_mbps: number | null
  random4k_single_write_mbps: number | null
  random4k_multi_read_mbps: number | null
  random4k_multi_write_mbps: number | null
  sequential1m_single_read_mbps: number | null
  sequential1m_single_write_mbps: number | null
  sequential1m_multi_read_mbps: number | null
  sequential1m_multi_write_mbps: number | null
  ip_type?: string | null
  youtube?: string | null
  chatgpt?: string | null
  port25?: boolean | null
  telecom_route?: string | null
  unicom_route?: string | null
  mobile_route?: string | null
}

export function nqBenchmarkFor(node: { nq_benchmark?: NqBenchmark | null }): NqBenchmark | null {
  return node.nq_benchmark ?? null
}

export function nqNetworkField(node: { nq_benchmark?: NqBenchmark | null }, field: "ip_type" | "youtube" | "chatgpt" | "port25" | "telecom_route" | "unicom_route" | "mobile_route"): string {
  const benchmark = nqBenchmarkFor(node)
  const value = benchmark?.[field]
  if (field === "port25") return value === true ? "可用" : value === false ? "阻断" : ""
  return typeof value === "string" ? value : ""
}

export function benchmarkPair(read: number | null | undefined, write: number | null | undefined): string {
  if (read == null && write == null) return ""
  return `读 ${read == null ? "—" : read.toFixed(1)} / 写 ${write == null ? "—" : write.toFixed(1)} MB/s`
}
