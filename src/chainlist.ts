// Reads Chainlist's RPC data (GPL-3.0). The source is a JavaScript file from a public repo, so it is parsed and
// never run. Only plain values are accepted; anything else is reported and skipped.
import { parse } from "acorn"
import { keccak256, stringToBytes, type Hex } from "viem"
import { fit } from "./derive"

export const CHAINLIST_REPO = "https://github.com/DefiLlama/chainlist.git"
export const CHAINLIST_NAME = "DefiLlama/chainlist"
export const CHAINLIST_LICENCE = "GPL-3.0"
export const CHAINLIST_FILE = "constants/extraRpcs.js"

export type Tracking = "none" | "limited" | "yes" | "unspecified"
export type ChainlistRpc = { chainId: bigint; url: string; tracking: Tracking; policyKey: string }
export type Chainlist = { rpcs: ChainlistRpc[]; policies: Map<string, string>; warnings: string[] }

const TRACKING = new Set(["none", "limited", "yes"])

function text(node: any): string | undefined {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked
  if (node?.type === "BinaryExpression" && node.operator === "+") {
    const left = text(node.left)
    const right = text(node.right)
    return left === undefined || right === undefined ? undefined : left + right
  }
  return undefined
}

const propertyName = (property: any): string | undefined => {
  if (property.type !== "Property" || property.computed) return undefined
  return property.key.type === "Identifier" ? property.key.name : String(property.key.value)
}

const field = (object: any, name: string) => object.properties.find((p: any) => propertyName(p) === name)?.value

function policyRef(node: any): string | undefined {
  if (node?.type !== "MemberExpression" || node.object?.name !== "privacyStatement") return undefined
  return node.computed ? text(node.property) : node.property.name
}

export const policyHash = (value: string): Hex => keccak256(stringToBytes(value))

export function parseChainlist(source: string): Chainlist {
  const program: any = parse(source, { ecmaVersion: "latest", sourceType: "module" })
  const declared = new Map<string, any>()
  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration" || statement.declaration?.type !== "VariableDeclaration") continue
    for (const d of statement.declaration.declarations) declared.set(d.id.name, d.init)
  }
  const statements = declared.get("privacyStatement")
  const chains = declared.get("extraRpcs")
  if (statements?.type !== "ObjectExpression" || chains?.type !== "ObjectExpression") throw new Error("Chainlist's file format has changed")

  const warnings: string[] = []
  const policies = new Map<string, string>()
  const named = new Map<string, string>()
  for (const p of statements.properties) {
    const name = propertyName(p)
    const value = text(p.value)
    if (name !== undefined && value !== undefined) named.set(name, value)
    else warnings.push(`Skipped a privacy statement that is not plain text: ${name ?? "unknown"}`)
  }

  const rpcs: ChainlistRpc[] = []
  const seen = new Set<string>()
  const add = (chainId: bigint, url: string | undefined, tracking: string | undefined, details: any) => {
    if (!url) return warnings.push(`Chain ${chainId}: skipped an entry with no plain URL`)
    if (fit(url) !== url) return warnings.push(`Chain ${chainId}: skipped a URL over 128 bytes`)
    if (seen.has(`${chainId}|${url}`)) return
    seen.add(`${chainId}|${url}`)
    let policyKey = ""
    const ref = policyRef(details)
    if (ref !== undefined) {
      const value = named.get(ref)
      if (value === undefined) warnings.push(`Chain ${chainId}: unknown privacy statement ${ref}`)
      else {
        policyKey = ref
        policies.set(ref, value)
      }
    } else if (details) {
      const value = text(details)
      if (value === undefined) warnings.push(`Chain ${chainId}: skipped privacy text that is not plain`)
      else {
        policyKey = `inline-${policyHash(value).slice(2, 14)}`
        policies.set(policyKey, value)
      }
    }
    rpcs.push({ chainId, url, tracking: tracking && TRACKING.has(tracking) ? (tracking as Tracking) : "unspecified", policyKey })
  }

  for (const chain of chains.properties) {
    const name = propertyName(chain)
    if (name === undefined || !/^\d+$/.test(name) || chain.value.type !== "ObjectExpression") {
      warnings.push(`Skipped chain entry ${name ?? "unknown"}`)
      continue
    }
    const list = field(chain.value, "rpcs")
    if (list?.type !== "ArrayExpression") continue
    for (const entry of list.elements) {
      if (entry?.type === "ObjectExpression") add(BigInt(name), text(field(entry, "url")), text(field(entry, "tracking")), field(entry, "trackingDetails"))
      else add(BigInt(name), text(entry), undefined, undefined)
    }
  }
  return { rpcs, policies, warnings }
}

/** One hash for the whole Chainlist import, covered by the anchor through the release meta. */
export function chainlistHash(rows: { chainId: bigint; url: string; tracking: string; policy: string }[]): Hex {
  const lines = rows.map((r) => `${r.chainId}|${r.url}|${r.tracking}|${r.policy}`).sort()
  return keccak256(stringToBytes(lines.join("\n")))
}

export const hashRows = (list: Chainlist) =>
  chainlistHash(list.rpcs.map((r) => ({ chainId: r.chainId, url: r.url, tracking: r.tracking, policy: r.policyKey ? policyHash(list.policies.get(r.policyKey)!) : "" })))
