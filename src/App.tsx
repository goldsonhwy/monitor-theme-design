import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { UserRound } from "lucide-react"

import { ServerTable, ServerTableSkeleton } from "@/components/ServerTable"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

import { Skeleton } from "@/components/ui/skeleton"
import { api, useNodes } from "@/lib/api"
import { Link, useNodeRoute } from "@/lib/route"
import { THEMES } from "@/lib/themes"
import { loadConfig } from "@/lib/config"
import { cn } from "@/lib/utils"

type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean }
type VisitorInfoData = { ip?: string; city?: string; region?: string; connection?: { isp?: string; org?: string } }

const MonitorPage = lazy(() => import("@/components/MonitorPage").then((module) => ({ default: module.MonitorPage })))

const DARK_MEDIA = matchMedia("(prefers-color-scheme: dark)")

type Mode = "light" | "dark" | "system"

/**
 * What the key says, read as the pre-paint script in index.html reads it: one of
 * the two names is a choice, anything else is none.
 */
const savedMode = (): Mode => {
  const saved = localStorage.getItem("theme")
  return saved === "dark" || saved === "light" ? saved : "system"
}

/**
 * The visitor's own choice, or the system's while there is none. Only the switch
 * writes the choice down, and "system" is written as no key at all: persisting
 * the system's answer would pin it, leaving a visitor who never touched the
 * switch in whichever mode their system happened to be in that day. The panel at
 * `/admin/` shares this key on one origin and reads it the same way, so it has
 * to hold to the same rule -- one app writing on load pins the others.
 */
function useTheme() {
  const [mode, setMode] = useState(savedMode)
  const system = useSyncExternalStore(
    (notify) => {
      DARK_MEDIA.addEventListener("change", notify)
      return () => DARK_MEDIA.removeEventListener("change", notify)
    },
    () => DARK_MEDIA.matches,
  )
  const dark = mode === "system" ? system : mode === "dark"

  // Another tab, or the panel open in one, changed the key: follow it, so two
  // tabs of one site do not disagree.
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === null || e.key === "theme") setMode(savedMode())
    }
    addEventListener("storage", sync)
    return () => removeEventListener("storage", sync)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  return {
    mode,
    dark,
    choose: (next: Mode) => {
      if (next === "system") localStorage.removeItem("theme")
      else localStorage.setItem("theme", next)
      setMode(next)
    },
  }
}


/**
 * Hook to manage dynamic tweakcn theme presets at runtime.
 */
function useThemePreset(dark: boolean) {
  const [themeId, setThemeId] = useState<string>(() => {
    const saved = localStorage.getItem("theme-preset")
    return THEMES.some((t) => t.id === saved) ? saved! : "claude"
  })

  const activeTheme = useMemo(() => THEMES.find((t) => t.id === themeId) ?? THEMES[0], [themeId])

  useEffect(() => {
    const vars = dark ? activeTheme.dark : activeTheme.light
    const root = document.documentElement
    for (const [key, val] of Object.entries(vars)) {
      root.style.setProperty(`--${key}`, String(val))
    }
    localStorage.setItem("theme-preset", themeId)
  }, [activeTheme, dark, themeId])

  return { themeId, setThemeId, activeTheme }
}

/**
 * Hook to manage Zen Browser dual-parameter texture settings:
 * 1. Grain (Perlin noise intensity, 0-100%)
 * 2. Frosted Blur / Opacity (Container acrylic translucency, 0-100%)
 */
function useTextureSettings() {
  const [grainPercent, setGrainPercent] = useState<number>(() => {
    const saved = localStorage.getItem("theme-grain-percent")
    if (saved !== null) {
      const num = Number(saved)
      if (!Number.isNaN(num) && num >= 0 && num <= 100) return num
    }
    const legacy = localStorage.getItem("theme-grain")
    if (legacy === "off") return 0
    if (legacy === "subtle") return 10
    if (legacy === "film") return 35
    return 16
  })

  const [frostedPercent, setFrostedPercent] = useState<number>(() => {
    const saved = localStorage.getItem("theme-frosted-percent")
    if (saved !== null) {
      const num = Number(saved)
      if (!Number.isNaN(num) && num >= 0 && num <= 100) return num
    }
    return 20 // Default 20% frosted translucency
  })

  useEffect(() => {
    const root = document.documentElement
    // Scale card opacity smoothly from 1.0 (0% frosted) down to 0.08 (100% frosted)
    const cardAlpha = Math.max(0.08, 1 - (frostedPercent * 0.92) / 100)
    root.style.setProperty("--card-opacity", String(cardAlpha))
    localStorage.setItem("theme-frosted-percent", String(frostedPercent))
  }, [frostedPercent])

  useEffect(() => {
    localStorage.setItem("theme-grain-percent", String(grainPercent))
  }, [grainPercent])

  return {
    grainPercent,
    setGrainPercent,
    frostedPercent,
    setFrostedPercent,
  }
}


function VisitorInfoFooter() {
  const [visitor, setVisitor] = useState<VisitorInfoData | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch("https://ipwho.is/?lang=zh-CN", { signal: controller.signal })
      .then((response) => response.json())
      .then((data: VisitorInfoData & { success?: boolean }) => {
        if (data.success !== false) setVisitor(data)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const location = [visitor?.city, visitor?.region].filter(Boolean).join("，") || "未知位置"
  const isp = visitor?.connection?.isp || visitor?.connection?.org || "未知运营商"

  return (
    <footer className="mt-auto border-t border-border/70 bg-background/70">
      <div className={cn(CONTAINER_CLASS, "flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-3 text-xs text-muted-foreground")}>
        <span>访客信息</span>
        <span>IP：{visitor?.ip || "加载中…"}</span>
        <span>位置：{location}</span>
        <span>运营商：{isp}</span>
      </div>
    </footer>
  )
}

// Fluid layout: full-width with safe side margins, no max-width constraint
const CONTAINER_CLASS = "mx-auto w-full px-4 sm:px-6 lg:px-8"

export default function App() {
  const { dark } = useTheme()
  const { setThemeId } = useThemePreset(dark)
  const { grainPercent, setGrainPercent, setFrostedPercent } = useTextureSettings()
  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [view, setView] = useState<"traffic" | "device" | "network-quality">("traffic")
  const [meError, setMeError] = useState("")
  const { nodes, error, closed } = useNodes()
  const open = useNodeRoute()

  const loadMe = useCallback(() => {
    return api<Me>("/me")
      .then((next) => { setMe(next); setMeError("") })
      .catch((e: Error) => setMeError(e.message || "网络错误"))
  }, [])

  useEffect(() => {
    loadMe()
    loadConfig().then((cfg) => {
      setConfig(cfg)
      if (!localStorage.getItem("theme-preset") && typeof cfg.theme_preset === "string") {
        setThemeId(cfg.theme_preset)
      }
      if (localStorage.getItem("theme-grain-percent") === null && typeof cfg.grain_percent === "number") {
        setGrainPercent(cfg.grain_percent)
      }
      if (localStorage.getItem("theme-frosted-percent") === null && typeof cfg.frosted_percent === "number") {
        setFrostedPercent(cfg.frosted_percent)
      }
    }).catch(() => {})
  }, [loadMe, setThemeId, setGrainPercent, setFrostedPercent])

  useEffect(() => {
    if (closed) void loadMe()
  }, [closed, loadMe])

  useEffect(() => {
    if (me && !me.public_page && !me.authed) location.href = "/admin/"
  }, [me])

  const sorted = [...(nodes ?? [])].sort((a, b) => a.sort - b.sort || a.id - b.id)
  const selected = sorted.find((n) => n.id === open)
  const site = me?.site_name || "Monitor"
  const notice = typeof config?.notice === "string" ? config.notice.trim() : ""

  useEffect(() => {
    document.title = [selected?.name, site].filter(Boolean).join(" · ")
  }, [selected?.name, site])

  if (!me) return (
    <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">
      {meError ? (
        <div className="space-y-3 text-center">
          <p role="alert">加载失败：{meError}</p>
          <Button onClick={loadMe}>重试</Button>
        </div>
      ) : (
        "加载中…"
      )}
    </div>
  )

  if (!me.public_page && !me.authed) return null

  return (
    <div className="relative flex min-h-svh flex-col bg-background">
      {/* Zen Browser-style tactile grain overlay */}
      {grainPercent > 0 && (
        <div
          className="pointer-events-none fixed inset-0 z-50 select-none bg-noise transition-opacity duration-200"
          style={{
            opacity: Math.min(1, (grainPercent / 100) * (dark ? 0.95 : 0.88)),
          }}
          aria-hidden="true"
        />
      )}

      {/* Standard full-width sticky navigation bar aligned with page measure */}
      <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className={cn(CONTAINER_CLASS, "flex h-14 min-w-0 items-center justify-between gap-4 max-sm:gap-2")}>
          <button type="button" onClick={() => location.reload()} aria-label="刷新页面" className="flex min-w-0 shrink items-center gap-2.5 font-semibold tracking-tight text-foreground transition-colors hover:opacity-90">
            <img src="/favicon.svg" alt="" className="size-5 shrink-0" />
            <span className="min-w-0 truncate text-base font-bold brand-glow">{site}</span>
          </button>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button type="button" onClick={() => { setView("traffic"); history.pushState(null, "", "/"); dispatchEvent(new PopStateEvent("popstate")) }} className={cn("rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground", view === "traffic" ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>流量</button>
            <button type="button" onClick={() => { setView("device"); history.pushState(null, "", "/"); dispatchEvent(new PopStateEvent("popstate")) }} className={cn("rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground", view === "device" ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>硬件</button>
            <button type="button" onClick={() => { setView("network-quality"); history.pushState(null, "", "/"); dispatchEvent(new PopStateEvent("popstate")) }} className={cn("rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground", view === "network-quality" ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>网络</button>
            <a
              href="/admin/"
              title={me.authed ? "后台" : "登录"}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <UserRound className="size-4" />
              <span className="sr-only">{me.authed ? "后台" : "登录"}</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main body with unified container width */}
      <main className={cn(CONTAINER_CLASS, "min-w-0 flex-1 space-y-6 py-6 max-md:py-4")}>
        {notice ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground shadow-2xs">
            <span className="font-semibold text-primary shrink-0">公告</span>
            <div className="min-w-0 flex-1 whitespace-pre-wrap">{notice}</div>
          </div>
        ) : null}

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {!nodes ? (
          <ServerTableSkeleton />
        ) : open === null ? (
          sorted.length === 0 ? (
            <Card className="py-16 text-center text-sm text-muted-foreground">还没有节点</Card>
          ) : (
            <ServerTable nodes={sorted} view={view} />
          )
        ) : selected ? (
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <MonitorPage nodes={sorted} selected={selected} />
          </Suspense>
        ) : (
          <Card className="py-16 text-center text-sm text-muted-foreground">
            节点不存在或未公开。<Link href="/" className="font-medium text-foreground hover:underline">返回列表</Link>
          </Card>
        )}
      </main>

      <VisitorInfoFooter />
    </div>
  )
}
