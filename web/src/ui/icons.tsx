// Lucide icons at gr8r's size and 1.8 stroke, named in kebab case like gr8r's ic('name').
import type { CSSProperties } from "react"
import {
  Activity, ArrowRight, ArrowUpRight, BadgeCheck, BookOpen, Box, Check, ChevronDown, ChevronRight, ChevronsUpDown, CircleAlert, CircleCheck, CircleDashed,
  CircleHelp, CircleX, Clock, Coins, Command, Compass, Copy, Database, Ellipsis, FileCheck, FileJson, Fingerprint, GitBranch, GitCommitHorizontal, Github, Globe,
  Hourglass, Info, Key, Layers, LayoutDashboard, Link, ListFilter, Loader, Lock, LogOut, Menu, Monitor, Moon, Network, PanelLeft, Pin, PinOff, Plus, Radio, RefreshCw,
  Rocket, Scale, ScrollText, Search, Send, Server, ShieldAlert, ShieldCheck, Signature, Sparkles, Star, Sun, Terminal, Timer, TriangleAlert, Unplug, Wallet, Wifi, WifiOff, X, Zap,
} from "lucide-react"

const MAP: Record<string, typeof Activity> = {
  activity: Activity, "arrow-right": ArrowRight, "arrow-up-right": ArrowUpRight, "badge-check": BadgeCheck, "book-open": BookOpen, box: Box, check: Check,
  "chevron-down": ChevronDown, "chevron-right": ChevronRight, "chevrons-up-down": ChevronsUpDown, "circle-alert": CircleAlert, "circle-check": CircleCheck,
  "circle-dashed": CircleDashed, "circle-help": CircleHelp, "circle-x": CircleX, clock: Clock, coins: Coins, command: Command, compass: Compass, copy: Copy,
  database: Database, ellipsis: Ellipsis, "file-check": FileCheck, "file-json": FileJson, fingerprint: Fingerprint, "git-branch": GitBranch, "git-commit": GitCommitHorizontal,
  github: Github, globe: Globe, hourglass: Hourglass, info: Info, key: Key, layers: Layers, "layout-dashboard": LayoutDashboard, link: Link, "list-filter": ListFilter,
  loader: Loader, lock: Lock, "log-out": LogOut, menu: Menu, monitor: Monitor, moon: Moon, network: Network, "panel-left": PanelLeft, pin: Pin, "pin-off": PinOff,
  plus: Plus, radio: Radio, "refresh-cw": RefreshCw, rocket: Rocket, scale: Scale, "scroll-text": ScrollText, search: Search, send: Send, server: Server,
  "shield-alert": ShieldAlert, "shield-check": ShieldCheck, signature: Signature, sparkles: Sparkles, star: Star, sun: Sun, terminal: Terminal, timer: Timer,
  "triangle-alert": TriangleAlert, unplug: Unplug, wallet: Wallet, wifi: Wifi, "wifi-off": WifiOff, x: X, zap: Zap,
}

export function I({ n, s = 16, className = "", style }: { n: string; s?: number; className?: string; style?: CSSProperties }) {
  const C = MAP[n] ?? CircleDashed
  return <C size={s} strokeWidth={1.8} className={`i ${className}`} style={style} aria-hidden="true" />
}
