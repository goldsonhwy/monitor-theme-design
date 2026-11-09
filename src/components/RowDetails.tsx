import { useEffect, useState, type ReactNode } from "react"
import { Area, AreaChart, CartesianGrid, Line as LineChartSeries, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChartLine } from "lucide-react"

import { deployed, Meter, OsIcon } from "@/components/NodeMarks"
import { IpInfo } from "@/components/IpInfo"
import { Badge } from "@/components/ui/badge"
import { Segmented } from "@/components/ui/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import type { Node } from "@/lib/api"
import {
  axisBytes, bytes, cpuName, CYCLES, daysUntil, dayUsage, FOREVER, money, monthUsage, osName, percent, periodStart,
  CONNECTION_COLOR_MAX, rateM, resourceColor, trafficAuto, trafficFlowAuto, trafficPairAuto,
  TRAFFIC_MODES, uptime, virtName,
} from "@/lib/format"
import { fetchHistory, type History, type Point } from "@/lib/history"
import { fillOfflineMetrics } from "@/lib/offline"
import { Link } from "@/lib/route"
import { cn } from "@/lib/utils"

// From the chart page's chunk, which App warms at start, so the table itself
// carries no recharts.
const CHART_TABS = [
  { value: "overview", label: "系统概况" },
  { value: "cpu", label: "CPU" },
  { value: "mem", label: "内存" },
  { value: "disk", label: "硬盘" },
  { value: "network", label: "网络速度" },
  { value: "latency", label: "网络延迟" },
  { value: "connections", label: "连接数" },
  { value: "ip", label: "IP信息" },
]
const CHART_HOURS = [1, 6, 24, 168] as const
const RANGE_LABEL: Record<number, string> = { 1: "1 小时", 6: "6 小时", 24: "24 小时", 168: "7 天" }

// Recharts chart styling constants matching NodeDetail
const AXIS = { stroke: "currentColor", fontSize: 11, tickLine: false, axisLine: false }
const SERIES = { dot: false as const, strokeWidth: 1.5, isAnimationActive: false }
const TIP = {
  backgroundColor: "var(--color-card)",
  borderColor: "var(--color-border)",
  borderRadius: "calc(var(--radius) - 2px)",
  borderWidth: 1,
  color: "var(--color-foreground)",
}

type ChartKind = "cpu" | "mem" | "disk" | "network" | "latency" | "connections" | "ip"

function useRangeHistory(id: number, hours: number, series: "metrics" | "ping") {
  const [state, setState] = useState<{ data: History | null; failed: string; loading: boolean }>({ data: null, failed: "", loading: true })
  useEffect(() => {
    let active = true
    setState({ data: null, failed: "", loading: true })
    fetchHistory(id, hours, series).then(
      (data) => { if (active) setState({ data, failed: "", loading: false }) },
      (e: Error) => { if (active) setState({ data: null, failed: e.message || "网络错误", loading: false }) },
    )
    return () => { active = false }
  }, [id, hours, series])
  return state
}

const axisLabel = (ts: number, hours: number) => new Date(ts).toLocaleString("zh-CN", hours <= 6
  ? { hour: "2-digit", minute: "2-digit" }
  : { month: "numeric", day: "numeric", hour: "2-digit" })

function pointRows(points: Point[], data: History, node: Node, hours: number) {
  return fillOfflineMetrics(points, data.step, {
    since: Math.floor(Date.now() / 1000) - hours * 3600,
    until: !node.online ? Math.floor(Date.now() / 1000) : undefined,
  }).map((point) => ({ ...point, ts: point.ts * 1000 }))
}

type CarrierRow = { ts: number; telecom: number | null; mobile: number | null; unicom: number | null }

function carrierOf(name: string): "telecom" | "mobile" | "unicom" | null {
  const value = name.toLowerCase()
  if (["电信", "telecom", "chinatelecom", "ctcc"].some((part) => value.includes(part))) return "telecom"
  if (["移动", "mobile", "chinamobile", "cmcc"].some((part) => value.includes(part))) return "mobile"
  if (["联通", "unicom", "chinaunicom", "cucc"].some((part) => value.includes(part))) return "unicom"
  return null
}

function pingRows(data: History): CarrierRow[] {
  const buckets = new Map<number, Record<"telecom" | "mobile" | "unicom", number[]>>()
  for (const point of data.ping) {
    const carrier = carrierOf(data.probes[String(point.task_id)] ?? "")
    if (!carrier) continue
    const bucket = buckets.get(point.ts) ?? { telecom: [], mobile: [], unicom: [] }
    if (point.latency !== null && point.latency >= 0) bucket[carrier].push(point.latency)
    buckets.set(point.ts, bucket)
  }
  return [...buckets].map(([ts, bucket]) => ({
    ts: ts * 1000,
    telecom: bucket.telecom.length ? bucket.telecom.reduce((sum, value) => sum + value, 0) / bucket.telecom.length : null,
    mobile: bucket.mobile.length ? bucket.mobile.reduce((sum, value) => sum + value, 0) / bucket.mobile.length : null,
    unicom: bucket.unicom.length ? bucket.unicom.reduce((sum, value) => sum + value, 0) / bucket.unicom.length : null,
  })).sort((a, b) => a.ts - b.ts)
}

function HistoryChart({ node, kind, hours }: { node: Node; kind: ChartKind; hours: number }) {
  const isPing = kind === "latency"
  const { data, failed, loading } = useRangeHistory(node.id, hours, isPing ? "ping" : "metrics")
  if (kind === "ip") return null
  const metrics = data ? pointRows(data.metrics, data, node, hours) : []
  const pings = data ? pingRows(data) : []
  const title = `${kind === "cpu" ? "CPU" : kind === "mem" ? "内存" : kind === "disk" ? "硬盘" : kind === "network" ? "网络速度" : kind === "latency" ? "网络延迟" : "连接数"} · 最近 ${RANGE_LABEL[hours]}`
  const label = (ts: unknown) => new Date(Number(ts)).toLocaleString("zh-CN")

  return (
    <section className="min-w-0 rounded-md border border-border/80 bg-card p-3">
      <h4 className="mb-2 flex min-h-5 flex-wrap items-center gap-x-2 text-xs font-semibold text-foreground">
        <span>{title}</span>
        {kind === "network" && <span className="font-normal text-muted-foreground"><span className="text-[#A78BFA]">↓ 下载速率</span> · <span className="text-[#38BDF8]">↑ 上传速率</span></span>}
        {kind === "connections" && <span className="font-normal text-muted-foreground"><span className="text-chart-1">TCP</span> · <span className="text-chart-4">UDP</span></span>}
        {kind === "latency" && <span className="font-normal text-muted-foreground"><span className="text-orange-500">电信</span> · <span className="text-sky-500">移动</span> · <span className="text-emerald-500">联通</span></span>}
      </h4>
      <div className="h-48 w-full">
        {loading ? <Skeleton className="h-full w-full" /> : failed ? (
          <p className="flex h-full items-center justify-center text-xs text-destructive">加载失败：{failed}</p>
        ) : !data || (isPing ? !pings.length : !metrics.length) ? (
          <p className="flex h-full items-center justify-center text-xs text-muted-foreground">暂无数据</p>
        ) : (
          <ResponsiveContainer>
            {isPing ? (
              <LineChart data={pings}>
                <CartesianGrid className="stroke-border" vertical={false} />
                <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(ts) => axisLabel(ts, hours)} minTickGap={32} {...AXIS} />
                <YAxis width={48} unit=" ms" {...AXIS} />
                <Tooltip labelFormatter={label} formatter={(value, name) => [`${value ?? "超时"}${value === null ? "" : " ms"}`, name === "telecom" ? "电信" : name === "mobile" ? "移动" : name === "unicom" ? "联通" : name]} contentStyle={TIP} />
                <LineChartSeries dataKey="telecom" name="telecom" connectNulls={false} stroke="#F97316" {...SERIES} />
                <LineChartSeries dataKey="mobile" name="mobile" connectNulls={false} stroke="#0EA5E9" {...SERIES} />
                <LineChartSeries dataKey="unicom" name="unicom" connectNulls={false} stroke="#10B981" {...SERIES} />
              </LineChart>
            ) : (
              <AreaChart data={metrics}>
                <CartesianGrid className="stroke-border" vertical={false} />
                <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(ts) => axisLabel(ts, hours)} minTickGap={32} {...AXIS} />
                <YAxis
                  width={58}
                  domain={kind === "cpu" ? [0, 100] : kind === "mem" ? [0, node.mem_total] : kind === "disk" ? [0, node.disk_total] : kind === "connections" ? [0, "auto"] : [0, "auto"]}
                  ticks={kind === "cpu" ? [0, 25, 50, 75, 100] : undefined}
                  tickFormatter={kind === "mem" || kind === "disk" ? axisBytes : kind === "network" ? rateM : undefined}
                  unit={kind === "cpu" ? "%" : undefined}
                  {...AXIS}
                />
                <Tooltip labelFormatter={label} formatter={(value, name) => {
                  const n = Number(value)
                  if (kind === "cpu") return [`${n.toFixed(1)}%`, "CPU"]
                  if (kind === "mem") return [bytes(n), "内存"]
                  if (kind === "disk") return [bytes(n), "硬盘"]
                  if (kind === "network") return [rateM(n), name === "net_rx" ? "下载速率" : "上传速率"]
                  return [n.toLocaleString("zh-CN"), name]
                }} contentStyle={TIP} />
                {kind === "cpu" && <Area dataKey="cpu" name="CPU" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.14} {...SERIES} />}
                {kind === "mem" && <Area dataKey="mem_used" name="内存" stroke="var(--color-chart-4)" fill="var(--color-chart-4)" fillOpacity={0.14} {...SERIES} />}
                {kind === "disk" && <Area dataKey="disk_used" name="硬盘" stroke="var(--color-chart-5)" fill="var(--color-chart-5)" fillOpacity={0.14} {...SERIES} />}
                {kind === "network" && [<Area key="download" dataKey="net_rx" name="下载速率" stroke="#A78BFA" fill="#A78BFA" fillOpacity={0.1} {...SERIES} />, <Area key="upload" dataKey="net_tx" name="上传速率" stroke="#38BDF8" fill="#38BDF8" fillOpacity={0.1} {...SERIES} />]}
                {kind === "connections" && <><Area dataKey="tcp" name="TCP" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.1} {...SERIES} /><Area dataKey="udp" name="UDP" stroke="var(--color-chart-4)" fill="var(--color-chart-4)" fillOpacity={0.1} {...SERIES} /></>}
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

function HistoryGrid({ node, kind }: { node: Node; kind: ChartKind }) {
  return <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">{CHART_HOURS.map((hours) => <HistoryChart key={hours} node={node} kind={kind} hours={hours} />)}</div>
}

/**
 * One topic per card, on the shaded strip the open row lays down.
 */
function Block({ title, aside, highlighted = false, children }: { title: string; aside?: ReactNode; highlighted?: boolean; children: ReactNode }) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-border/80 bg-card p-3.5 shadow-xs transition-colors", highlighted && "border-primary/70 bg-primary/5 ring-2 ring-primary/35")}>
      <h4 className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
        <span>{title}</span>
        {aside}
      </h4>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

/** One fact per line, the label in a fixed column so the values align. */
function Line({ label, className, onClick, children }: { label: string; className?: string; onClick?: () => void; children: ReactNode }) {
  return (
    <div className={cn("grid min-w-0 grid-cols-[3.8rem_minmax(0,1fr)] items-baseline gap-x-2 text-xs leading-5", onClick && "cursor-pointer")} onClick={onClick}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tnum break-words font-medium text-foreground", className)}>{children}</span>
    </div>
  )
}

/**
 * This period's usage against the plan's quota, with today's share lifted a
 * shade at the tip.
 */
function PeriodMeter({ used, today, limit, title }: { used: number; today: number; limit: number; title: string }) {
  const pct = percent(used, limit)
  const share = pct > 0 ? (percent(Math.min(today, used), limit) / pct) * 100 : 0
  return (
    <Meter pct={pct} title={title} className="my-1.5 h-2">
      {today > 0 && <div className="absolute inset-y-0 right-0 min-w-0.5 rounded-r-full bg-background/45" style={{ width: `${share}%` }} />}
    </Meter>
  )
}

function ResourceValue({ value, maximum = 100, children }: { value: number; maximum?: number; children: ReactNode }) {
  return <span style={{ color: resourceColor(value, maximum) }}>{children}</span>
}

/** The four cards: the machine, what it is doing, what it has moved, and its term. */
type OverviewBlock = "system" | "resource" | "traffic" | "billing"

function Overview({ node, highlightedBlocks = [], onLocation }: { node: Node; highlightedBlocks?: OverviewBlock[]; onLocation: () => void }) {
  const m = node.online ? node.metrics : null
  const away = node.last_seen ? Date.now() / 1000 - node.last_seen : 0
  const days = node.expires_in !== undefined ? node.expires_in : daysUntil(node.expires_at)
  const used = monthUsage(node)
  const today = dayUsage(node)
  const limit = node.traffic_limit
  const since = periodStart(node.month_start)
  const usage = (used: number, total: number) => `${trafficPairAuto(used, total)}（${percent(used, total).toFixed(1)}%）`
  const flow = (rx: number, tx: number) => trafficFlowAuto(rx, tx)
  const metering = [
    node.traffic_reset_day > 0 && `每月 ${node.traffic_reset_day} 日重置`,
    limit > 0 && (TRAFFIC_MODES[node.traffic_mode] ?? node.traffic_mode),
  ].filter(Boolean)

  return (
    <div className="grid gap-3 @min-[30rem]:grid-cols-2 @6xl:grid-cols-4">
      <Block
        title="系统信息"
        highlighted={highlightedBlocks.includes("system")}
        aside={
          <div className="flex items-center gap-1.5">
            {node.group && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                {node.group}
              </Badge>
            )}
            {node.agent_version && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                v{node.agent_version}
              </Badge>
            )}
          </div>
        }
      >
        <Line label="系统">
          <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
            <OsIcon os={node.os} />
            <span className="min-w-0 truncate">{osName(node.os) || "—"}</span>
          </span>
        </Line>
        <Line label="位置" className="text-primary underline-offset-2 hover:underline" onClick={onLocation}>{node.country || "—"}</Line>
        {node.kernel && <Line label="内核">{node.kernel}</Line>}
        <Line label="架构">{[node.arch, virtName(node.virt)].filter(Boolean).join(" · ") || "—"}</Line>
        <Line label="CPU">{node.cpu_name ? `${cpuName(node.cpu_name)} × ${node.cpu_cores}` : `${node.cpu_cores} 核`}</Line>
        <Line label={node.online ? "在线" : "离线"}>
          {node.online ? (m ? uptime(m.uptime) : "等待上报") : away >= 60 ? uptime(away) : "刚刚"}
        </Line>
      </Block>

      <Block
        title="资源监控"
        highlighted={highlightedBlocks.includes("resource")}
        aside={
          <Link href={`/node/${node.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ChartLine className="size-3" />
            历史图表
          </Link>
        }
      >
        {m && <Line label="CPU"><ResourceValue value={m.cpu}>{m.cpu.toFixed(1)}%</ResourceValue></Line>}
        <Line label="内存">{m ? <ResourceValue value={percent(m.mem_used, m.mem_total)}>{usage(m.mem_used, m.mem_total)}</ResourceValue> : bytes(node.mem_total)}</Line>
        <Line label="交换">{node.swap_total > 0 ? (m ? usage(m.swap_used, m.swap_total) : bytes(node.swap_total)) : "未启用"}</Line>
        <Line label="硬盘">{m ? <ResourceValue value={percent(m.disk_used, m.disk_total)}>{usage(m.disk_used, m.disk_total)}</ResourceValue> : bytes(node.disk_total)}</Line>
        {m && <Line label="负载">{m.load.map((n) => n.toFixed(2)).join(" / ")}</Line>}
        {m && <Line label="TCP"><ResourceValue value={m.tcp} maximum={CONNECTION_COLOR_MAX}>{m.tcp.toLocaleString("zh-CN")}</ResourceValue></Line>}
        {m && <Line label="UDP"><ResourceValue value={m.udp} maximum={CONNECTION_COLOR_MAX}>{m.udp.toLocaleString("zh-CN")}</ResourceValue></Line>}
      </Block>

      <Block
        title="流量统计"
        highlighted={highlightedBlocks.includes("traffic")}
        aside={
          since && (
            <span className="tnum text-[11px] text-muted-foreground">
              {since}起
            </span>
          )
        }
      >
        <Line label="本期">{limit > 0 ? usage(used, limit) : `${trafficAuto(used)} / ${FOREVER}`}</Line>
        {limit > 0 && (
          <PeriodMeter used={used} today={today} limit={limit} title={`本期已用 ${trafficPairAuto(used, limit)}，其中今日 ${trafficAuto(today, Math.max(used, limit))}`} />
        )}
        <Line label="今日">{flow(node.day_rx, node.day_tx)}</Line>
        <Line label="累计">{flow(node.total_rx, node.total_tx)}</Line>
        {metering.length > 0 && <Line label="计量">{metering.join(" · ")}</Line>}
      </Block>

      <Block title="账单信息" highlighted={highlightedBlocks.includes("billing")}>
        <Line label="续费">
          {node.price > 0 ? `${money(node.price, node.currency)} / ${CYCLES[node.billing_cycle] ?? node.billing_cycle}` : "免费白嫖"}
        </Line>
        <Line label="到期">{node.expires_at || "长期有效"}</Line>
        {days !== null && (
          <Line label="剩余">
            {days < 0 ? (
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">已过期 {-days} 天</Badge>
            ) : days <= 7 ? (
              <Badge variant="warning" className="px-1.5 py-0 text-[10px]">剩余 {days} 天</Badge>
            ) : (
              `${days} 天`
            )}
          </Line>
        )}
      </Block>
    </div>
  )
}

/**
 * What a row opens into: the network view requested by a traffic cell, then
 * the round trips to the node and the four cards of what it is behind them.
 */
export function RowDetails({
  node,
  resourceChart,
  overviewRequest = 0,
  overviewHighlights = [],
}: {
  node: Node
  resourceChart?: ChartKind | null
  overviewRequest?: number
  overviewHighlights?: OverviewBlock[]
}) {
  const [tab, setTab] = useState("overview")
  const [highlightedBlocks, setHighlightedBlocks] = useState<OverviewBlock[]>(overviewHighlights)

  useEffect(() => {
    if (!overviewRequest) return
    setTab("overview")
    setHighlightedBlocks(overviewHighlights)
  }, [overviewHighlights, overviewRequest])

  useEffect(() => {
    if (resourceChart) setTab(resourceChart)
  }, [resourceChart])

  const ready = deployed(node)

  if (!ready) {
    return <p className="px-4 py-4 text-sm text-muted-foreground">尚未接入。在后台生成安装命令并执行一次。</p>
  }

  return (
    <div className="space-y-3.5 px-4 py-3.5 text-xs @max-3xl:px-2">
      <div className="flex min-w-0 items-center">
        <Segmented
          value={tab}
          onChange={setTab}
          options={CHART_TABS}
          label="详情视图"
          className="max-w-full overflow-x-auto scrollbar-none"
        />
      </div>
      {tab === "overview" ? <Overview node={node} highlightedBlocks={highlightedBlocks} onLocation={() => setTab("ip")} /> : tab === "ip" ? <IpInfo node={node} /> : <HistoryGrid node={node} kind={tab as ChartKind} />}
    </div>
  )
}