import { useEffect, useState, type ComponentProps } from "react"

const read = () => {
  const match = location.pathname.match(/^\/node\/(\d+)/)
  return match ? Number(match[1]) : null
}
export function useNodeRoute() {
  const [id, setId] = useState(read)
  useEffect(() => {
    const sync = () => setId(read())
    addEventListener("popstate", sync)
    return () => removeEventListener("popstate", sync)
  }, [])
  return id
}

/**
 * The filter bar's previous/next buttons and the empty-result jump use this
 * directly: they are not links, and every `useNodeRoute` still hears the change
 * because it is announced as a popstate.
 */
export function navigate(href: string) {
  history.pushState({}, "", href)
  dispatchEvent(new PopStateEvent("popstate"))
  scrollTo(0, 0)
}

/**
 * Read the current chart hash parameter from URL.
 * e.g. #chart=cpu → "cpu"
 */
export function getChartHash(): string | null {
  const hash = location.hash
  const match = hash.match(/chart=([^&]+)/)
  return match ? match[1] : null
}

/**
 * Set the chart hash parameter without navigating away.
 */
export function setChartHash(chart: string) {
  const url = new URL(location.href)
  url.hash = `chart=${chart}`
  history.pushState({}, "", url.toString())
}

export function clearChartHash() {
  const url = new URL(location.href)
  url.hash = ""
  history.pushState({}, "", url.toString())
}

/**
 * A real anchor, so a modified or middle click still opens a new tab; only a plain
 * click is kept in the page.
 */
export function Link({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(href)
      }}
      {...props}
    />
  )
}
