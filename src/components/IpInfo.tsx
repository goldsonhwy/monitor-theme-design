import { Badge } from "@/components/ui/badge"
import type { Node } from "@/lib/api"

const FIELDS: Array<[string, string]> = [
  ["脱敏IP", "脱敏IP"],
  ["自治系统编号", "ASN"],
  ["自治系统组织", "自治系统组织"],
  ["国家", "国家"],
  ["国家代码", "国家代码"],
  ["地区", "地区"],
  ["城市", "城市"],
  ["邮政编码", "邮政编码"],
  ["时区", "时区"],
  ["纬度", "纬度"],
  ["经度", "经度"],
  ["是否代理", "是否代理"],
]

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "暂不可用"
  return String(value)
}

export function IpInfo({ node }: { node: Node }) {
  const info = node.ip_info as Record<string, unknown> | undefined
  if (!info) {
    return <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">IPv4 信息正在后台分批查询，结果缓存约 7 天；当前暂无已缓存结果。</p>
  }
  const row = (label: string, value: unknown) => (
    <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-2 text-xs leading-5">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words font-medium text-foreground">{formatValue(value)}</span>
    </div>
  )
  return (
    <div className="grid gap-3 @min-[30rem]:grid-cols-2">
      <section className="min-w-0 rounded-lg border border-border/80 bg-card p-3.5 shadow-xs">
        <h4 className="mb-2 text-xs font-semibold text-foreground">IP 情报</h4>
        <div className="space-y-1.5">
          {FIELDS.map(([key, label]) => <span key={key}>{row(label, info[key])}</span>)}
          {row("数据来源", info["数据来源"])}
          {row("查询时间", info["查询时间"] ? new Date(Number(info["查询时间"]) * 1000).toLocaleString("zh-CN") : null)}
        </div>
      </section>
      <section className="min-w-0 rounded-lg border border-border/80 bg-card p-3.5 shadow-xs">
        <h4 className="mb-2 text-xs font-semibold text-foreground">说明</h4>
        <div className="space-y-2 text-xs leading-5 text-muted-foreground">
          <p>以上数据全部来自 IP2Location.io 指定 IPv4 查询接口。</p>
          <p>原始 IPv4 已隐藏，仅显示前三段地址。</p>
          <Badge variant="outline" className="text-[10px] font-normal">IP2Location.io</Badge>
        </div>
      </section>
    </div>
  )
}
