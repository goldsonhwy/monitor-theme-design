import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"

import { Dot, Flag, Meter, Num, OsIcon, SLOT } from "@/components/NodeMarks"
import { RowDetails } from "@/components/RowDetails"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Node } from "@/lib/api"
import { CONNECTION_COLOR_MAX, DAY_COLOR_MAX, daysUntil, FOREVER, MONTH_COLOR_MAX, monthUsage, offlineDuration, onlineDuration, percent, RATE_COLOR_MAX, rateM, resourceColor, trafficAuto, trafficAutoFixed, trafficColor, trafficPairAuto } from "@/lib/format"
import { fetchHistory, latestCarrierPings, mergeCarrierPings, type LatestPing } from "@/lib/history"
import { nqBenchmarkFor, nqNetworkField } from "../lib/nqBenchmarks"
import { cn } from "@/lib/utils"
import nqLogoLinked from "../../public/nq-resource-2.svg"
import nqLogoUnlinked from "../../public/nq-resource-3.svg"

function ProviderPlaceholder() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-0.5 bg-muted/30 text-muted-foreground">
      <span className="text-[10px] font-semibold leading-none">服务商</span>
      <span className="text-[9px] leading-none">图片占位</span>
    </div>
  )
}

function ProviderImage({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <ProviderPlaceholder />
  return (
    <img
      src={src}
      alt={`${name} 服务商`}
      loading="lazy"
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

function priceLabel(node: Node): string {
  if (!node.price || node.price <= 0) return "免费白嫖"
  const currency = ({ CNY: "元", USD: "刀", EUR: "欧" } as Record<string, string>)[node.currency] ?? node.currency
  const cycle = node.billing_cycle === "yearly" ? "/年" : node.billing_cycle === "monthly" ? "/月" : node.billing_cycle === "once" ? "一次性" : `/${node.billing_cycle}`
  const isCny = node.currency === "CNY"
  const priceStr = isCny ? String(node.price) : node.price.toFixed(2)
  return `${priceStr}${currency}${cycle}`
}

function Bar({ pct }: { pct: number | null }) {
  const v = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  return (
    <div className="flex h-6 min-w-0 flex-col items-end justify-between">
      <span
        className="tnum w-full truncate text-right text-[11px] leading-none @max-3xl:text-[9px]"
        style={pct === null ? undefined : { color: resourceColor(v) }}
      >
        {pct === null ? "—" : `${v.toFixed(1)}%`}
      </span>
      <Meter pct={pct} fillColor={pct === null ? undefined : resourceColor(v)} />
    </div>
  )
}

function TrafficBar({ pct, label, down, up }: { pct: number | null; label: string; down: number; up: number }) {
  const usedWidth = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  const total = down + up
  const downWidth = total > 0 ? (down / total) * 100 : 0
  const upWidth = total > 0 ? (up / total) * 100 : 0
  return (
    <div className="flex h-6 min-w-0 flex-col items-end justify-between">
      <div className="tnum w-full truncate text-right text-[11px] leading-none text-muted-foreground @max-3xl:text-[9px]">
        {label}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10" aria-label="流量使用进度，柔和紫为下载、天空蓝为上传">
        <div className="flex h-full overflow-hidden rounded-full transition-[width] duration-500" style={{ width: `${usedWidth}%` }}>
          <div className="h-full bg-[#A78BFA]" style={{ width: `${downWidth}%` }} />
          <div className="h-full bg-[#38BDF8]" style={{ width: `${upWidth}%` }} />
        </div>
      </div>
    </div>
  )
}

function ShareBar({ down, up }: { down: number; up: number }) {
  const total = down + up
  const downWidth = total > 0 ? (down / total) * 100 : 50
  const upWidth = total > 0 ? (up / total) * 100 : 50
  return (
    <div className="mobile-sharebar h-1.5 w-full overflow-hidden rounded-full bg-primary/10" aria-label="分享率组成，柔和紫为下载、天空蓝为上传">
      <div className="flex h-full" style={{ width: "100%" }}>
        <div className="h-full bg-[#A78BFA]" style={{ width: `${downWidth}%` }} />
        <div className="h-full bg-[#38BDF8]" style={{ width: `${upWidth}%` }} />
      </div>
    </div>
  )
}

function expiryDays(node: Node): number | null {
  return node.expires_in !== undefined ? node.expires_in : daysUntil(node.expires_at)
}

function isExpiringSoon(node: Node): boolean {
  const days = expiryDays(node)
  return days !== null && days >= 0 && days <= 20
}

function Expiry({ node }: { node: Node }) {
  const days = expiryDays(node)
  if (days === null) return <span className="text-emerald-500" title="永不到期">无限时</span>
  if (days < 0) return <Badge variant="destructive" className="px-1.5 py-0 text-[10px] font-normal">已过期</Badge>
  if (days <= 20) return <span className="text-red-500">{days} 天</span>
  const colorClass = days > 100 ? "text-emerald-500" : days >= 30 ? "text-amber-500" : "text-red-500"
  return <span className={colorClass}>{days} 天</span>
}

const ALERT_RATE = 50 * 1024 ** 2

const COL = {
  status: "mobile-status w-auto min-w-8 text-center @max-3xl:w-[5%]",
  provider: "mobile-hide w-auto min-w-14 text-center @max-3xl:w-[11%] @max-3xl:min-w-14",
  nq: "mobile-hide w-auto min-w-8 text-center",
  price: "mobile-hide w-auto min-w-14 text-right @max-3xl:w-18 @max-3xl:min-w-14",
  name: "mobile-name w-auto min-w-20 truncate text-left font-medium @max-3xl:w-[17%] @max-3xl:max-w-none @max-3xl:min-w-0",
  location: "mobile-hide w-auto min-w-10 text-center @max-3xl:w-[6%]",
  os: "mobile-hide w-auto min-w-8 text-center @max-5xl:hidden",
  uptime: "mobile-hide w-auto min-w-14 text-right @max-3xl:hidden",
  expiry: "mobile-hide w-auto min-w-14 text-right @max-5xl:hidden",
  connections: "mobile-hide w-auto min-w-14 text-right @max-5xl:hidden",
  ping: "mobile-hide ping-resolution-column w-auto min-w-9 text-right",
  speed: "mobile-speed w-20 min-w-20 max-w-20 whitespace-nowrap text-right overflow-hidden",
  bar: "mobile-bar w-auto min-w-14 text-right @max-3xl:w-[9%] @max-3xl:min-w-0 overflow-hidden",
  day: "mobile-hide w-auto min-w-14 text-right @max-3xl:hidden",
  ratio: "mobile-ratio w-auto min-w-10 text-right",
  month: "mobile-hide w-auto min-w-14 text-right @max-3xl:hidden",
  month_ratio: "mobile-hide w-auto min-w-10 text-right @max-3xl:hidden",
  traffic: "mobile-hide w-auto min-w-18 text-right @max-3xl:w-[21%] @max-3xl:min-w-0 overflow-hidden",
}

type SortField = "online_status" | "device_cores" | "device_single_core" | "device_multi_core" | "device_random4k_single" | "device_random4k_multi" | "device_sequential1m_single" | "device_sequential1m_multi" | "device_mem_total" | "device_disk_total" | "provider" | "name" | "nq" | "price" | "location" | "os" | "uptime" | "expiry" | "connections" | "ping_telecom" | "ping_mobile" | "ping_unicom" | "speed_down" | "speed_up" | "cpu" | "mem" | "disk" | "day_down" | "day_up" | "ratio" | "month_down" | "month_up" | "month_ratio" | "traffic"
type SortOrder = "asc" | "desc"
const CARRIER_PING_HOURS = 6

// 2026 year-to-date ECB reference-rate averages, used only for price sorting.
const SORT_RATES_CNY: Record<string, number> = { CNY: 1, USD: 6.804536, EUR: 7.868435 }

function annualPriceCny(node: Node): number {
  if (!node.price || node.price <= 0) return 0
  const annualFactor: Record<string, number> = {
    monthly: 12,
    quarterly: 4,
    semiannual: 2,
    yearly: 1,
    biennial: 0.5,
    triennial: 1 / 3,
    once: 1,
  }
  return node.price * (annualFactor[node.billing_cycle] ?? 1) * (SORT_RATES_CNY[node.currency] ?? 1)
}

function rmb(amount: number): string {
  return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function remainingValueCny(node: Node): number {
  const days = node.expires_in !== undefined ? node.expires_in : daysUntil(node.expires_at)
  if (days === null || days <= 0 || !node.price || node.price <= 0) return 0

  const cycleDays: Record<string, number> = {
    monthly: 365 / 12,
    quarterly: 365 / 4,
    semiannual: 365 / 2,
    yearly: 365,
    biennial: 365 * 2,
    triennial: 365 * 3,
  }
  const periodDays = cycleDays[node.billing_cycle] ?? 365
  const periodPriceCny = node.price * (SORT_RATES_CNY[node.currency] ?? 1)
  const remainingFraction = Math.min(1, days / periodDays)
  return periodPriceCny * remainingFraction
}

function totalRemainingValueCny(nodes: Node[]): number {
  return nodes.reduce((total, node) => total + remainingValueCny(node), 0)
}

function calcRatio(tx: number, rx: number): number | null {
  if (rx <= 0) return null
  return tx / rx
}

function ratioColor(ratio: number | null): string {
  if (ratio === null) return "text-muted-foreground"
  if (ratio > 1.3) return "text-emerald-500"
  if (ratio < 0.7) return "text-red-500"
  return "text-amber-500"
}

/** Latency color: green → lime → amber → orange → red */
function latencyColor(latency: number | null): string {
  if (latency === null || latency < 0) return "text-muted-foreground"
  if (latency <= 50) return "text-emerald-500"
  if (latency <= 80) return "text-lime-500"
  if (latency <= 250) return "text-amber-500"
  if (latency <= 500) return "text-orange-500"
  return "text-red-500"
}

/** Loss color: green → lime → amber → orange → red → darker red */
function lossColor(loss: number | null): string {
  if (loss === null || loss < 0) return "text-muted-foreground"
  if (loss === 0) return "text-emerald-500"
  if (loss <= 1) return "text-lime-500"
  if (loss <= 5) return "text-amber-500"
  if (loss <= 10) return "text-orange-500"
  if (loss <= 20) return "text-red-400"
  return "text-red-600"
}

function sortNodes(nodes: Node[], field: SortField | null, order: SortOrder): Node[] {
  if (!field) return [...nodes].sort((a, b) => a.sort - b.sort || a.id - b.id)

  return [...nodes].sort((a, b) => {
    let res = 0
    const ma = a.online ? a.metrics : null
    const mb = b.online ? b.metrics : null

    switch (field) {
      case "online_status":
        res = Number(a.online) - Number(b.online)
        break
      case "device_cores":
        res = a.cpu_cores - b.cpu_cores
        break
      case "device_single_core":
        res = (nqBenchmarkFor(a)?.geekbench5_single ?? -1) - (nqBenchmarkFor(b)?.geekbench5_single ?? -1)
        break
      case "device_multi_core":
        res = (nqBenchmarkFor(a)?.geekbench5_multi ?? -1) - (nqBenchmarkFor(b)?.geekbench5_multi ?? -1)
        break
      case "device_random4k_single":
        res = (nqBenchmarkFor(a)?.random4k_single_read_mbps ?? -1) - (nqBenchmarkFor(b)?.random4k_single_read_mbps ?? -1)
        break
      case "device_random4k_multi":
        res = (nqBenchmarkFor(a)?.random4k_multi_read_mbps ?? -1) - (nqBenchmarkFor(b)?.random4k_multi_read_mbps ?? -1)
        break
      case "device_sequential1m_single":
        res = (nqBenchmarkFor(a)?.sequential1m_single_read_mbps ?? -1) - (nqBenchmarkFor(b)?.sequential1m_single_read_mbps ?? -1)
        break
      case "device_sequential1m_multi":
        res = (nqBenchmarkFor(a)?.sequential1m_multi_read_mbps ?? -1) - (nqBenchmarkFor(b)?.sequential1m_multi_read_mbps ?? -1)
        break
      case "device_mem_total":
        res = a.mem_total - b.mem_total
        break
      case "device_disk_total":
        res = a.disk_total - b.disk_total
        break
      case "provider":
        res = (a.provider_link_url || "").localeCompare(b.provider_link_url || "", "zh-CN")
        break
      case "name":
        res = a.name.localeCompare(b.name, "zh-CN")
        break
      case "nq":
        res = Number(Boolean(a.nq_link_url)) - Number(Boolean(b.nq_link_url))
        break
      case "price":
        res = annualPriceCny(a) - annualPriceCny(b)
        break
      case "location":
        res = (a.country || "").localeCompare(b.country || "", "zh-CN")
        break
      case "os":
        res = (a.os || "").localeCompare(b.os || "", "zh-CN")
        break
      case "uptime":
        res = (ma?.uptime ?? -1) - (mb?.uptime ?? -1)
        break
      case "expiry": {
        const ea = a.expires_in !== undefined ? a.expires_in : daysUntil(a.expires_at)
        const eb = b.expires_in !== undefined ? b.expires_in : daysUntil(b.expires_at)
        const va = ea === null ? Infinity : ea
        const vb = eb === null ? Infinity : eb
        res = va - vb
        break
      }
      case "connections":
        res = ((ma?.tcp ?? -1) + (ma?.udp ?? -1)) - ((mb?.tcp ?? -1) + (mb?.udp ?? -1))
        break
      case "ping_telecom": {
        res = (a.latency_telecom ?? -1) - (b.latency_telecom ?? -1)
        break
      }
      case "ping_mobile": {
        res = (a.latency_mobile ?? -1) - (b.latency_mobile ?? -1)
        break
      }
      case "ping_unicom": {
        res = (a.latency_unicom ?? -1) - (b.latency_unicom ?? -1)
        break
      }
      case "speed_down":
        res = (ma?.net_rx ?? -1) - (mb?.net_rx ?? -1)
        break
      case "speed_up":
        res = (ma?.net_tx ?? -1) - (mb?.net_tx ?? -1)
        break
      case "cpu":
        res = (ma?.cpu ?? -1) - (mb?.cpu ?? -1)
        break
      case "mem": {
        const pa = ma ? ma.mem_used / Math.max(1, ma.mem_total) : -1
        const pb = mb ? mb.mem_used / Math.max(1, mb.mem_total) : -1
        res = pa - pb
        break
      }
      case "disk": {
        const pa = ma ? ma.disk_used / Math.max(1, ma.disk_total) : -1
        const pb = mb ? mb.disk_used / Math.max(1, mb.disk_total) : -1
        res = pa - pb
        break
      }
      case "day_down":
        res = a.day_rx - b.day_rx
        break
      case "day_up":
        res = a.day_tx - b.day_tx
        break
      case "ratio":
        res = (calcRatio(a.day_tx, a.day_rx) ?? -1) - (calcRatio(b.day_tx, b.day_rx) ?? -1)
        break
      case "month_down":
        res = a.month_rx - b.month_rx
        break
      case "month_up":
        res = a.month_tx - b.month_tx
        break
      case "month_ratio":
        res = (calcRatio(a.month_tx, a.month_rx) ?? -1) - (calcRatio(b.month_tx, b.month_rx) ?? -1)
        break
      case "traffic":
        res = monthUsage(a) - monthUsage(b)
        break
    }

    return order === "desc" ? -res : res
  })
}

function PingCell({ latency, loss }: { latency?: number; loss?: number }) {
  const validLatency = latency !== undefined && latency >= 0 ? latency : null
  const validLoss = loss !== undefined && loss >= 0 ? loss : null

  return (
    <div className="flex flex-col items-end justify-center leading-none gap-0.5">
      <span className={cn("text-[11px] font-medium tabular-nums", latencyColor(validLatency))}>
        {validLatency !== null ? `${Math.round(validLatency)} ms` : "—"}
      </span>
      <span className={cn("text-[10px] tabular-nums", lossColor(validLoss))}>
        {validLoss !== null ? `${validLoss.toFixed(1)}%` : "—"}
      </span>
    </div>
  )
}

function BenchmarkBar({ label, value, color }: { label: string; value: number | null | undefined; color: "read" | "write" }) {
  const width = value == null ? 0 : Math.min(100, Math.max(4, Math.log10(value + 1) * 20))
  const tone = color === "read" ? "bg-emerald-500" : "bg-sky-500"
  return (
    <div className="flex min-w-24 items-center gap-2">
      <span className={cn("w-7 shrink-0 text-left text-[10px]", color === "read" ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400")}>{label}</span>
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", tone)} style={{ width: `${width}%` }} /></div>
      <span className="tnum min-w-12 text-right">{value == null ? "" : `${value.toFixed(1)} MB/s`}</span>
    </div>
  )
}

function nqField(node: Node, field: "ip_type" | "youtube" | "chatgpt" | "port25" | "telecom_route" | "unicom_route" | "mobile_route"): ReactNode {
  return nqNetworkField(node, field) || "未采集"
}

function onlineDurationColor(seconds: number): string {
  if (seconds < 3600) return "text-red-500"
  if (seconds < 86400) return "text-amber-500"
  return "text-emerald-500"
}

function useCarrierPings(node: Node): LatestPing {
  const [pings, setPings] = useState<LatestPing | null>(null)
  const direct = useMemo<LatestPing>(() => ({
    telecom: { latency: node.latency_telecom, loss: node.loss_telecom },
    mobile: { latency: node.latency_mobile, loss: node.loss_mobile },
    unicom: { latency: node.latency_unicom, loss: node.loss_unicom },
  }), [node.latency_telecom, node.loss_telecom, node.latency_mobile, node.loss_mobile, node.latency_unicom, node.loss_unicom])

  useEffect(() => {
    let active = true
    setPings(null)
    fetchHistory(node.id, CARRIER_PING_HOURS, "ping")
      .then((data) => { if (active) setPings(mergeCarrierPings(latestCarrierPings(data), direct)) })
      .catch(() => { if (active) setPings(direct) })
    return () => { active = false }
  }, [node.id, direct])

  return pings ?? direct
}

function Row({ node, isOpen, onToggle, onOpen, deviceMode = false, networkMode = false, simpleMode = false }: { node: Node; isOpen: boolean; onToggle: () => void; onOpen: () => void; deviceMode?: boolean; networkMode?: boolean; simpleMode?: boolean }) {
  const open = isOpen
  const [resourceChart, setResourceChart] = useState<"cpu" | "mem" | "disk" | "network" | "latency" | "connections" | "ip" | null>(null)
  const [overviewRequest, setOverviewRequest] = useState(0)
  const [overviewHighlights, setOverviewHighlights] = useState<Array<"system" | "resource" | "traffic" | "billing">>([])
  const carrierPings = useCarrierPings(node)
  const benchmark = nqBenchmarkFor(node)
  const m = node.online ? node.metrics : null
  const traffic = monthUsage(node)
  const ratio = calcRatio(node.day_tx, node.day_rx)
  const monthRatio = calcRatio(node.month_tx, node.month_rx)
  const telecom = carrierPings.telecom
  const mobile = carrierPings.mobile
  const unicom = carrierPings.unicom
  const toggle = () => {
    setResourceChart(null)
    setOverviewHighlights([])
    onToggle()
  }
  const openOverview = (highlights: Array<"system" | "resource" | "traffic" | "billing">) => (event: MouseEvent) => {
    event.stopPropagation()
    setResourceChart(null)
    setOverviewHighlights(highlights)
    setOverviewRequest((request) => request + 1)
    onOpen()
  }
  const openResource = (chart: "cpu" | "mem" | "disk" | "network" | "latency" | "connections" | "ip") => (event: MouseEvent) => {
    event.stopPropagation()
    setResourceChart(chart)
    onOpen()
  }

  if (simpleMode) return (
    <TableRow data-node-row="true" className="hover:bg-muted/40">
      <TableCell className="text-center"><Dot node={node} /></TableCell>
      <TableCell className="min-w-28">
        <a href={node.provider_link_url || undefined} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className={cn("mx-auto block aspect-[3/1] w-full max-w-24 overflow-hidden rounded-sm border border-border/60 bg-muted/30", !node.provider_link_url && "pointer-events-none")}>
          <ProviderImage src={node.provider_image_url} name={node.name} />
        </a>
      </TableCell>
      <TableCell className="min-w-28 truncate text-left">{node.name}</TableCell>
    </TableRow>
  )

  if (networkMode) return (
    <TableRow data-node-row="true" className="hover:bg-muted/40">
      <TableCell className="text-center"><Dot node={node} /></TableCell>
      <TableCell className="min-w-28"><a href={node.provider_link_url || undefined} target="_blank" rel="noreferrer" className={cn("mx-auto block aspect-[3/1] w-full max-w-24 overflow-hidden rounded-sm border border-border/60 bg-muted/30", !node.provider_link_url && "pointer-events-none")}><ProviderImage src={node.provider_image_url} name={node.name} /></a></TableCell>
      <TableCell className="min-w-28 truncate text-left">{node.name}</TableCell>
      <TableCell className="whitespace-nowrap">{node.nq_link_url ? <a href={node.nq_link_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">NQ</a> : ""}</TableCell>
      <TableCell className="whitespace-nowrap">{priceLabel(node)}</TableCell>
      <TableCell>{nqField(node, "ip_type")}</TableCell>
      <TableCell>{nqField(node, "youtube")}</TableCell>
      <TableCell>{nqField(node, "chatgpt")}</TableCell>
      <TableCell>{nqField(node, "port25")}</TableCell>
      <TableCell>{nqField(node, "telecom_route")}</TableCell>
      <TableCell>{nqField(node, "unicom_route")}</TableCell>
      <TableCell>{nqField(node, "mobile_route")}</TableCell>
    </TableRow>
  )

  if (deviceMode) return (
    <TableRow data-node-row="true" className="hover:bg-muted/40">
      <TableCell className="text-center"><Dot node={node} /></TableCell>
      <TableCell className="min-w-28">
        <a href={node.provider_link_url || undefined} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className={cn("mx-auto block aspect-[3/1] w-full max-w-24 overflow-hidden rounded-sm border border-border/60 bg-muted/30", !node.provider_link_url && "pointer-events-none")}>
          <ProviderImage src={node.provider_image_url} name={node.name} />
        </a>
      </TableCell>
      <TableCell className="min-w-28 truncate text-left">{node.name}</TableCell>
      <TableCell className="whitespace-nowrap">{priceLabel(node)}</TableCell>
      <TableCell>{node.cpu_cores || ""}</TableCell>
      <TableCell className="whitespace-nowrap">{node.cpu_name || ""}</TableCell>
      <TableCell className="whitespace-nowrap" />
      <TableCell className="whitespace-nowrap">{benchmark?.single_core ?? ""}</TableCell>
      <TableCell className="whitespace-nowrap">{benchmark?.multi_core ?? ""}</TableCell>
      <TableCell className="whitespace-nowrap">{node.mem_total ? `${(node.mem_total / 1024 ** 3).toFixed(1)} GB` : ""}</TableCell>
      <TableCell><div className="grid gap-1"><BenchmarkBar label="读" value={benchmark?.random4k_single_read_mbps} color="read" /><BenchmarkBar label="写" value={benchmark?.random4k_single_write_mbps} color="write" /></div></TableCell>
      <TableCell><div className="grid gap-1"><BenchmarkBar label="读" value={benchmark?.random4k_multi_read_mbps} color="read" /><BenchmarkBar label="写" value={benchmark?.random4k_multi_write_mbps} color="write" /></div></TableCell>
      <TableCell><div className="grid gap-1"><BenchmarkBar label="读" value={benchmark?.sequential1m_single_read_mbps} color="read" /><BenchmarkBar label="写" value={benchmark?.sequential1m_single_write_mbps} color="write" /></div></TableCell>
      <TableCell><div className="grid gap-1"><BenchmarkBar label="读" value={benchmark?.sequential1m_multi_read_mbps} color="read" /><BenchmarkBar label="写" value={benchmark?.sequential1m_multi_write_mbps} color="write" /></div></TableCell>
      <TableCell className="whitespace-nowrap">{node.disk_total ? trafficAuto(node.disk_total) : ""}</TableCell>
    </TableRow>
  )

  return (
    <>
      <TableRow
        data-node-row="true"
        aria-expanded={open}
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
        className={cn(
          "cursor-pointer transition-colors hover:bg-muted/40",
          open && "border-b-0 bg-muted/25 hover:bg-muted/30",
        )}
      >
        <TableCell className={cn(COL.status, "text-center")}>
          <div className="flex items-center justify-center">
            <Dot node={node} />
          </div>
        </TableCell>
        <TableCell className={COL.provider}>
          <a
            href={node.provider_link_url || undefined}
            target="_blank"
            rel="noreferrer"
            aria-label={`查看 ${node.name} 的服务商`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "mx-auto block aspect-[3/1] w-full max-w-24 overflow-hidden rounded-sm border border-border/60 bg-muted/30 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !node.provider_link_url && "pointer-events-none",
            )}
          >
            <ProviderImage src={node.provider_image_url} name={node.name} />
          </a>
        </TableCell>
        <TableCell className={cn(COL.name, "text-left font-medium")} title={node.name} onClick={openOverview(["system", "resource"])}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">{node.name}</span>
          </div>
        </TableCell>
        <TableCell className={COL.nq}>
          <a href={node.nq_link_url || undefined} target="_blank" rel="noreferrer" aria-label={`打开 ${node.name} 的 NQ 链接`} onClick={(e) => e.stopPropagation()} className={cn("mx-auto flex size-8 items-center justify-center rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", !node.nq_link_url && "pointer-events-none")}>
            <img src={node.nq_link_url ? nqLogoLinked : nqLogoUnlinked} alt="NQ" className="size-5.5 object-contain" />
          </a>
        </TableCell>
        <TableCell className={cn(COL.price, "tnum text-xs whitespace-nowrap")} onClick={openOverview(["billing"])}>{priceLabel(node)}</TableCell>
        <TableCell className={cn(COL.location, "cursor-pointer hover:text-primary")} onClick={openResource("ip")}><Flag code={node.country} /></TableCell>
        <TableCell className={COL.os} onClick={openOverview(["system"])}>
          <span className="inline-flex items-center justify-center">
            <OsIcon os={node.os} />
          </span>
        </TableCell>
        <TableCell className={cn(COL.uptime, "tnum")}>{m ? <span className={onlineDurationColor(m.uptime)}>{onlineDuration(m.uptime)}</span> : "—"}</TableCell>
        <TableCell className={cn(COL.expiry, "tnum", isExpiringSoon(node) && "cell-alert-pulse")} onClick={openOverview(["billing"])}><Expiry node={node} /></TableCell>
        <TableCell className={cn(COL.connections, "tnum cursor-pointer hover:text-primary")} onClick={openResource("connections")}>
          {m ? <span style={{ color: resourceColor(m.tcp + m.udp, CONNECTION_COLOR_MAX) }}>{(m.tcp + m.udp).toLocaleString("zh-CN")}</span> : "—"}
        </TableCell>
        <TableCell className={cn(COL.ping)} onClick={openResource("latency")}><PingCell latency={telecom?.latency} loss={telecom?.loss} /></TableCell>
        <TableCell className={cn(COL.ping)} onClick={openResource("latency")}><PingCell latency={mobile?.latency} loss={mobile?.loss} /></TableCell>
        <TableCell className={cn(COL.ping)} onClick={openResource("latency")}><PingCell latency={unicom?.latency} loss={unicom?.loss} /></TableCell>
        {!node.online ? (
          <TableCell colSpan={5} className="mobile-offline-resource text-center whitespace-nowrap text-muted-foreground">
            <span className="inline-flex items-center justify-center gap-2">
              <span>{offlineDuration(Date.now() / 1000 - node.last_seen)}</span>
            </span>
          </TableCell>
        ) : (
          <>
            <TableCell className={cn(COL.speed, "px-0.5!", m && m.net_rx > ALERT_RATE && "cell-alert-pulse")} onClick={openResource("network")}>
              {m ? <span className="flex w-full min-w-0 items-center justify-end gap-px overflow-hidden leading-none"><ArrowDown className="size-2.5 shrink-0 text-[#A78BFA]" /><span className="tnum min-w-0 truncate text-right" style={{ color: trafficColor(m.net_rx, RATE_COLOR_MAX, "download") }}>{rateM(m.net_rx)}</span></span> : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className={cn(COL.speed, "px-0.5!", m && m.net_tx > ALERT_RATE && "cell-alert-pulse")} onClick={openResource("network")}>
              {m ? <span className="flex w-full min-w-0 items-center justify-end gap-px overflow-hidden leading-none"><ArrowUp className="size-2.5 shrink-0 text-[#38BDF8]" /><span className="tnum min-w-0 truncate text-right" style={{ color: trafficColor(m.net_tx, RATE_COLOR_MAX, "upload") }}>{rateM(m.net_tx)}</span></span> : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className={cn(COL.bar, m && m.cpu > 90 && "cell-alert-pulse")} onClick={openResource("cpu")}><Bar pct={m ? m.cpu : null} /></TableCell>
            <TableCell className={cn(COL.bar, m && percent(m.mem_used, m.mem_total) > 90 && "cell-alert-pulse")} onClick={openResource("mem")}><Bar pct={m ? percent(m.mem_used, m.mem_total) : null} /></TableCell>
            <TableCell className={COL.bar} onClick={openResource("disk")}><Bar pct={m ? percent(m.disk_used, m.disk_total) : null} /></TableCell>
          </>
        )}
        <TableCell className={cn(COL.day, "tnum cursor-pointer hover:text-primary")} onClick={openResource("network")} style={{ color: trafficColor(node.day_rx, DAY_COLOR_MAX, "download") }}>{trafficAuto(node.day_rx)}</TableCell>
        <TableCell className={cn(COL.day, "tnum cursor-pointer hover:text-primary")} onClick={openResource("network")} style={{ color: trafficColor(node.day_tx, DAY_COLOR_MAX, "upload") }}>{trafficAuto(node.day_tx)}</TableCell>
        <TableCell className={cn(COL.ratio, "tnum cursor-pointer hover:text-primary")} onClick={openResource("network")}>
          <div className="mobile-ratio-content flex flex-col items-end gap-1">
            <span className={cn("text-xs font-medium", ratioColor(ratio))}>{ratio === null ? "—" : ratio.toFixed(1)}</span>
            <ShareBar down={node.day_rx} up={node.day_tx} />
          </div>
        </TableCell>

        <TableCell className={cn(COL.month, "tnum cursor-pointer hover:text-primary")} onClick={openResource("network")} style={{ color: trafficColor(node.month_rx, MONTH_COLOR_MAX, "download") }}>{trafficAuto(node.month_rx)}</TableCell>
        <TableCell className={cn(COL.month, "tnum cursor-pointer hover:text-primary")} onClick={openResource("network")} style={{ color: trafficColor(node.month_tx, MONTH_COLOR_MAX, "upload") }}>{trafficAuto(node.month_tx)}</TableCell>
        <TableCell className={cn(COL.month_ratio, "tnum cursor-pointer hover:text-primary")} onClick={openResource("network")}>
          <div className="flex flex-col items-end gap-1">
            <span className={cn("text-xs font-medium", ratioColor(monthRatio))}>
              {monthRatio === null ? "—" : monthRatio.toFixed(1)}
            </span>
            <ShareBar down={node.month_rx} up={node.month_tx} />
          </div>
        </TableCell>
        <TableCell
          className={COL.traffic}
          onClick={openOverview(["traffic"])}
          title={`本期已用 ${node.traffic_limit > 0 ? `${trafficPairAuto(traffic, node.traffic_limit)}（${((traffic / node.traffic_limit) * 100).toFixed(1)}%）` : `${trafficAuto(traffic)} · 无流量配额`}`}
        >
          <TrafficBar
            pct={node.traffic_limit > 0 ? percent(traffic, node.traffic_limit) : null}
            label={`${node.traffic_limit > 0 ? trafficPairAuto(traffic, node.traffic_limit) : `${trafficAuto(traffic)} / ${FOREVER}`}`}
            down={node.month_rx}
            up={node.month_tx}
          />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="border-b bg-muted/25 hover:bg-muted/25">
          <TableCell colSpan={25} className="p-0! text-left whitespace-normal">
            <RowDetails
              node={node}
              resourceChart={resourceChart}
              overviewRequest={overviewRequest}
              overviewHighlights={overviewHighlights}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function SortableHead({
  col,
  label,
  field,
  onSort,
  deviceMode = false,
}: {
  col: keyof typeof COL
  label: ReactNode
  field?: SortField
  onSort: (field: SortField) => void
  deviceMode?: boolean
}) {
  return (
    <TableHead
      className={cn(
        "group h-8 px-1.5 text-center text-[11px] font-medium text-muted-foreground transition-colors @max-3xl:px-0.5 @max-3xl:text-[10px]",
        deviceMode ? "whitespace-nowrap px-3" : COL[col],
        field && "cursor-pointer select-none hover:text-foreground",
      )}
      onClick={field ? () => onSort(field) : undefined}
    >
      <div className="flex items-center justify-center gap-1 @max-3xl:gap-0.5">
        <span>{label}</span>
      </div>
    </TableHead>
  )
}

export function ServerTable({ nodes, view = "traffic" }: { nodes: Node[]; view?: "traffic" | "device" | "network-quality" }) {
  const [openNodeId, setOpenNodeId] = useState<number | null>(null)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")

  useEffect(() => {
    if (openNodeId === null) return
    const closeOnBlankClick = (event: globalThis.MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest("[data-node-row], button, a, input, select, textarea, [role='button']")) return
      setOpenNodeId(null)
    }
    document.addEventListener("click", closeOnBlankClick)
    return () => document.removeEventListener("click", closeOnBlankClick)
  }, [openNodeId])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === "desc") {
        setSortOrder("asc")
      } else {
        setSortField(null)
        setSortOrder("desc")
      }
    } else {
      setSortField(field)
      setSortOrder("desc")
    }
  }

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const groups = useMemo(() => {
    return [...new Set(nodes.map((n) => n.group ?? "").filter(Boolean))]
  }, [nodes])

  const hasUngrouped = useMemo(() => {
    return groups.length > 0 && nodes.some((n) => !(n.group ?? ""))
  }, [groups, nodes])

  const groupNodes = useMemo(() => {
    if (selectedGroup === null) return nodes
    if (selectedGroup === "") return nodes.filter((n) => !(n.group ?? ""))
    return nodes.filter((n) => n.group === selectedGroup)
  }, [nodes, selectedGroup])

  const online = groupNodes.filter((n) => n.online && n.metrics)
  const live = (pick: (m: NonNullable<Node["metrics"]>) => number) => online.reduce((total, n) => total + pick(n.metrics!), 0)
  const all = (pick: (n: Node) => number) => groupNodes.reduce((total, n) => total + pick(n), 0)

  const sortedNodes = useMemo(() => sortNodes(groupNodes, sortField, sortOrder), [groupNodes, sortField, sortOrder])

  const liveRx = live((m) => m.net_rx)
  const liveTx = live((m) => m.net_tx)
  const speedRatio = calcRatio(liveTx, liveRx)

  const totalDayRx = all((n) => n.day_rx)
  const totalDayTx = all((n) => n.day_tx)
  const dayRatioVal = calcRatio(totalDayTx, totalDayRx)

  const totalMonthRx = all((n) => n.month_rx)
  const totalMonthTx = all((n) => n.month_tx)
  const monthRatioVal = calcRatio(totalMonthTx, totalMonthRx)

  const totalRx = all((n) => n.total_rx)
  const totalTx = all((n) => n.total_tx)
  const totalRatioVal = calcRatio(totalTx, totalRx)

  const annualCostCny = nodes.reduce((total, node) => total + annualPriceCny(node), 0)
  const remainingValue = totalRemainingValueCny(nodes)

  const heads: [keyof typeof COL, ReactNode, SortField?][] = view === "network-quality" ? [
    ["status", "状态", "online_status"], ["provider", "服务商", "provider"], ["name", "名称", "name"],
    ["nq", "NQ", "nq"], ["price", "价格", "price"], ["bar", "IP类型"], ["bar", "YouTube地区"],
    ["bar", "ChatGPT解锁"], ["bar", "25端口出站"], ["bar", "电信回程路由"], ["bar", "联通回程路由"], ["bar", "移动回程路由"],
  ] : view === "device" ? [
    ["status", "状态", "online_status"],
    ["provider", "服务商", "provider"],
    ["name", "名称", "name"],
    ["price", "NQ价格", "price"],
    ["bar", "核心数", "device_cores"],
    ["bar", "CPU型号"],
    ["bar", "CPU主频"],
    ["bar", "单核得分", "device_single_core"],
    ["bar", "多核得分", "device_multi_core"],
    ["bar", "内存总量", "device_mem_total"],
    ["bar", "单线程随机4K", "device_random4k_single"],
    ["bar", "多线程随机4K", "device_random4k_multi"],
    ["bar", "单线程顺序1M", "device_sequential1m_single"],
    ["bar", "多线程顺序1M", "device_sequential1m_multi"],
    ["bar", "硬盘总容量", "device_disk_total"],
  ] : [
    ["status", <><span className="mobile-hide">状态</span><span className="mobile-only">&nbsp;</span></>],
    ["provider", "服务商", "provider"],
    ["name", "名称", "name"],
    ["nq", "NQ", "nq"],
    ["price", "价格", "price"],
    ["location", "位置", "location"],
    ["os", "系统", "os"],
    ["uptime", "在线", "uptime"],
    ["expiry", "到期", "expiry"],
    ["connections", "连接数", "connections"],
    ["ping", "电信", "ping_telecom"],
    ["ping", "移动", "ping_mobile"],
    ["ping", "联通", "ping_unicom"],
    ["speed", <><span className="mobile-hide">下载速率</span><span className="mobile-only">下载</span></>, "speed_down"],
    ["speed", <><span className="mobile-hide">上传速率</span><span className="mobile-only">上传</span></>, "speed_up"],
    ["bar", "CPU", "cpu"],
    ["bar", "内存", "mem"],
    ["bar", "硬盘", "disk"],
    ["day", "今日下", "day_down"],
    ["day", "今日上", "day_up"],
    ["ratio", "日分享", "ratio"],
    ["month", "本月下", "month_down"],
    ["month", "本月上", "month_up"],
    ["month_ratio", "月分享", "month_ratio"],
    ["traffic", "流量限额", "traffic"],
  ]

  return (
    <Card className="desktop-polish @container gap-0 overflow-hidden py-0">
      <CardHeader className="mobile-stat-header border-b border-border/60 py-3 max-md:px-3 gap-3">
        <div className="desktop-stat-list mobile-stat-list mobile-stat-compact tnum flex w-full min-w-0 flex-nowrap items-center gap-1.5 text-xs">
          <div
            className="mobile-stat inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1"
            title="所有节点按账期折算的一年费用总和"
            data-mobile-stat="年付费总和"
            data-mobile-stat-desktop-only="true"
          >
            <span className="mobile-stat-label text-muted-foreground"><span aria-hidden="true">💰</span> 年付费总和</span>
            <span className="font-semibold text-foreground">{rmb(annualCostCny)}</span>
          </div>

          <div
            className="mobile-stat inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1"
            title="所有节点按各自账期金额 × 剩余账期比例估算未使用金额"
            data-mobile-stat="剩余价值"
            data-mobile-stat-desktop-only="true"
          >
            <span className="mobile-stat-label text-muted-foreground"><span aria-hidden="true">💰</span> 剩余价值</span>
            <span className="font-semibold text-foreground">{rmb(remainingValue)}</span>
          </div>

          <div
            className="mobile-stat inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1"
            title="在线节点此刻的下行与上行之和"
            data-mobile-stat="实时网速"
          >
            <span className="mobile-stat-label text-muted-foreground">实时网速</span>
            <ArrowDown className="mobile-stat-down-icon size-3 text-[#A78BFA] shrink-0" />
            <Num ch={SLOT.rate} className="mobile-stat-down-value font-semibold text-foreground">{rateM(liveRx)}</Num>
            <ArrowUp className="mobile-stat-up-icon size-3 text-[#38BDF8] shrink-0" />
            <Num ch={SLOT.rate} className="mobile-stat-up-value font-semibold text-foreground">{rateM(liveTx)}</Num>
            <span className={cn("mobile-stat-extra inline-flex items-center gap-0.5 font-bold text-xs", ratioColor(speedRatio))}>
              <span>⚖️</span>
              <span>{speedRatio === null ? "—" : speedRatio.toFixed(2)}</span>
            </span>
          </div>

          <div
            className="mobile-stat inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1"
            title="所有节点今日下载与上传之和"
            data-mobile-stat="本日"
          >
            <span className="mobile-stat-label text-muted-foreground">本日流量</span>
            <ArrowDown className="mobile-stat-down-icon size-3 text-[#A78BFA] shrink-0" />
            <Num ch={SLOT.bytes} className="mobile-stat-down-value font-semibold text-foreground">{trafficAutoFixed(totalDayRx, 2, Math.max(totalDayRx, totalDayTx))}</Num>
            <ArrowUp className="mobile-stat-up-icon size-3 text-[#38BDF8] shrink-0" />
            <Num ch={SLOT.bytes} className="mobile-stat-up-value font-semibold text-foreground">{trafficAutoFixed(totalDayTx, 2, Math.max(totalDayRx, totalDayTx))}</Num>
            <span className={cn("mobile-stat-extra inline-flex items-center gap-0.5 font-bold text-xs", ratioColor(dayRatioVal))}>
              <span>⚖️</span>
              <span>{dayRatioVal === null ? "—" : dayRatioVal.toFixed(1)}</span>
            </span>
          </div>

          <div
            className="mobile-stat inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1"
            title="所有节点本期的下载与上传之和"
            data-mobile-stat="本月"
            data-mobile-stat-desktop-only="true"
          >
            <span className="mobile-stat-label text-muted-foreground">本月流量</span>
            <ArrowDown className="mobile-stat-down-icon size-3 text-[#A78BFA] shrink-0" />
            <Num ch={SLOT.bytes} className="mobile-stat-down-value font-semibold text-foreground">{trafficAutoFixed(totalMonthRx, 1, Math.max(totalMonthRx, totalMonthTx))}</Num>
            <ArrowUp className="mobile-stat-up-icon size-3 text-[#38BDF8] shrink-0" />
            <Num ch={SLOT.bytes} className="mobile-stat-up-value font-semibold text-foreground">{trafficAutoFixed(totalMonthTx, 1, Math.max(totalMonthRx, totalMonthTx))}</Num>
            <span className={cn("mobile-stat-extra inline-flex items-center gap-0.5 font-bold text-xs", ratioColor(monthRatioVal))}>
              <span>⚖️</span>
              <span>{monthRatioVal === null ? "—" : monthRatioVal.toFixed(1)}</span>
            </span>
          </div>

          <div
            className="desktop-stat mobile-hide inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1 max-sm:hidden"
            title="所有节点自接入以来的下载与上传之和"
            data-mobile-stat="累计"
            data-mobile-stat-desktop-only="true"
          >
            <span className="text-muted-foreground">累计流量</span>
            <span className="font-semibold text-foreground inline-flex items-center gap-1.5 leading-none">
              <span className="inline-flex items-center gap-0.5 leading-none">
                <ArrowDown className="size-3 text-[#A78BFA] shrink-0" />
                <Num ch={SLOT.bytes}>{trafficAutoFixed(totalRx, 0, Math.max(totalRx, totalTx))}</Num>
              </span>
              <span className="inline-flex items-center gap-0.5 leading-none">
                <ArrowUp className="size-3 text-[#38BDF8] shrink-0" />
                <Num ch={SLOT.bytes}>{trafficAutoFixed(totalTx, 0, Math.max(totalRx, totalTx))}</Num>
              </span>
            </span>
            <span className={cn("inline-flex items-center gap-0.5 font-bold text-xs", ratioColor(totalRatioVal))}>
              <span>⚖️</span>
              <span>{totalRatioVal === null ? "—" : totalRatioVal.toFixed(1)}</span>
            </span>
          </div>
        </div>
      </CardHeader>

      {/* Group selector pill bar (renders only when node groups exist) */}
      {groups.length > 0 && (
        <div className="mobile-hide flex items-center gap-1.5 overflow-x-auto border-b border-border/60 bg-muted/20 px-3 py-2 text-xs scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedGroup(null)}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer",
              selectedGroup === null
                ? "bg-primary text-primary-foreground font-medium shadow-2xs"
                : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            全部 ({nodes.length})
          </button>
          {groups.map((g) => {
            const count = nodes.filter((n) => n.group === g).length
            return (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGroup(g)}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer",
                  selectedGroup === g
                    ? "bg-primary text-primary-foreground font-medium shadow-2xs"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {g} ({count})
              </button>
            )
          })}
          {hasUngrouped && (
            <button
              type="button"
              onClick={() => setSelectedGroup("")}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer",
                selectedGroup === ""
                  ? "bg-primary text-primary-foreground font-medium shadow-2xs"
                  : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              未分组 ({nodes.filter((n) => !(n.group ?? "")).length})
            </button>
          )}
        </div>
      )}

      <CardContent className="mobile-table-shell p-0 overflow-x-auto">
        <Table className="mobile-table text-center text-xs min-w-max">
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-muted/20">
              {heads.map(([col, label, field], i) => (
                <SortableHead
                  key={i}
                  col={col}
                  label={label}
                  field={field}
                  onSort={handleSort}
                  deviceMode={view === "device"}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:px-1.5 [&_td]:py-0.5 @max-3xl:[&_td]:px-0.5 @max-3xl:[&_td]:py-0.5 @max-3xl:[&_td:first-child]:pl-1 @max-3xl:[&_td:last-child]:pr-1">
            {sortedNodes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={25} className="py-12 text-center text-sm text-muted-foreground">
                  没有匹配的服务器
                </TableCell>
              </TableRow>
            ) : (
              sortedNodes.map((n) => (
                <Row
                  key={n.id}
                  node={n}
                  isOpen={openNodeId === n.id}
                  onToggle={() => setOpenNodeId((current) => current === n.id ? null : n.id)}
                  onOpen={() => setOpenNodeId((current) => current === n.id ? null : n.id)}
                  deviceMode={view === "device"}
                  networkMode={view === "network-quality"}

                />
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/**
 * High-fidelity table skeleton to prevent layout shifts (CLS = 0) during initial load.
 */
export function ServerTableSkeleton() {
  return (
    <Card className="@container gap-0 overflow-hidden py-0">
      <CardHeader className="border-b border-border/60 py-3 sm:flex-row sm:items-center sm:justify-between max-md:px-3 gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-md" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-7 w-28 rounded-md" />
          <Skeleton className="h-7 w-36 rounded-md" />
          <Skeleton className="h-7 w-32 rounded-md" />
          <Skeleton className="h-7 w-32 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <div className="divide-y divide-border/30 min-w-max">
          <div className="flex h-9 items-center px-4 bg-muted/20">
            <Skeleton className="h-3 w-full" />
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex h-11 items-center gap-4 px-4">
              <Skeleton className="size-2.5 rounded-full shrink-0" />
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton className="h-4 w-32 shrink-0" />
              <Skeleton className="h-4 w-12 shrink-0 @max-sm:hidden" />
              <Skeleton className="h-4 w-8 shrink-0 @max-5xl:hidden" />
              <Skeleton className="h-4 w-16 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-4 w-16 shrink-0 @max-5xl:hidden" />
              <Skeleton className="h-2 w-10 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-2 w-10 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-2 w-10 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-4 w-10 shrink-0 @max-3xl:w-8" />
              <Skeleton className="h-4 w-10 shrink-0 @max-3xl:w-8" />
              <Skeleton className="h-2 w-16 shrink-0" />
              <Skeleton className="h-2 w-16 shrink-0" />
              <Skeleton className="h-2 w-16 shrink-0" />
              <Skeleton className="h-2 w-12 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-2 w-12 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-2 w-10 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-2 w-12 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-2 w-12 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-2 w-10 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-2 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
