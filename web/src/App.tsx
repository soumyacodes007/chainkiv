import { useEffect } from "react"
import { href, useRoute } from "./lib/router"
import { boot, getState, setUi, useStore } from "./lib/store"
import { ConnectModal } from "./modals/Connect"
import { About } from "./pages/About"
import { ChainPage } from "./pages/Chain"
import { Chains } from "./pages/Chains"
import { Health } from "./pages/Health"
import { Overview } from "./pages/Overview"
import { Proposals } from "./pages/Proposals"
import { Releases } from "./pages/Releases"
import { RpcPage } from "./pages/Rpc"
import { Submit } from "./pages/Submit"
import { Verify } from "./pages/Verify"
import { Palette } from "./shell/Palette"
import { Shell } from "./shell/Shell"
import { ChartTip } from "./ui/charts"
import { Empty, ToastHost } from "./ui/kit"

function useTheme() {
  const theme = useStore((s) => s.prefs.theme)
  useEffect(() => {
    const r = document.documentElement
    if (theme === "system") r.removeAttribute("data-theme")
    else r.setAttribute("data-theme", theme)
  }, [theme])
}

function Page() {
  const route = useRoute()
  const ready = useStore((s) => s.ready)
  const failed = useStore((s) => s.failed && !s.chains.length)
  if (!ready)
    return (
      <div className="page">
        <div className="skel-hero" />
        <div className="skel-row">
          <div />
          <div />
          <div />
          <div />
        </div>
      </div>
    )
  if (failed)
    return (
      <div className="page">
        <div className="panel" style={{ maxWidth: 520, margin: "40px auto" }}>
          <Empty icon="wifi-off" title="Nothing to show yet" text="The cached copy didn't load and Arkiv has no records yet. Try again in a moment." />
        </div>
      </div>
    )
  switch (route.name) {
    case "overview":
      return <Overview />
    case "chains":
      return <Chains />
    case "chain":
      return <ChainPage key={route.params.id} id={route.params.id!} />
    case "rpc":
      return <RpcPage key={route.params.urlHash} chainId={route.params.chainId!} hash={route.params.urlHash!} />
    case "verify":
      return <Verify key={route.params.id} id={route.params.id!} />
    case "health":
      return <Health />
    case "releases":
      return <Releases />
    case "proposals":
      return <Proposals />
    case "submit":
      return <Submit key={route.seq} />
    case "about":
      return <About />
    default:
      return (
        <div className="page">
          <div className="panel" style={{ maxWidth: 520, margin: "40px auto" }}>
            <Empty icon="search" title="Page not found" text="The page moved, or never existed.">
              <a className="btn btn-secondary btn-sm" href={href("")}>
                Go to Overview
              </a>
            </Empty>
          </div>
        </div>
      )
  }
}

export function App() {
  const ui = useStore((s) => s.ui)
  useTheme()
  useEffect(() => {
    void boot()
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setUi({ palette: !getState().ui.palette })
      }
    }
    addEventListener("keydown", key)
    return () => removeEventListener("keydown", key)
  }, [])
  return (
    <>
      <Shell>
        <Page />
      </Shell>
      {ui.palette && <Palette />}
      {ui.modal === "connect" && <ConnectModal />}
      <ChartTip />
      <ToastHost />
    </>
  )
}
