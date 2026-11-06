// How it works and how fresh it is, for someone who just wants to know why to believe any of this.
import { useEffect, useState } from "react"
import { ago, fmt } from "../lib/format"
import { ETH_NETWORK, hasPublisher, publisherName, reg } from "../lib/registry"
import { useStore } from "../lib/store"
import { useRelease } from "../lib/useRelease"
import { I } from "../ui/icons"
import { Addr, Code, Empty, Panel } from "../ui/kit"

const QUERIES: [string, string][] = [
  ["One chain", "chainId = u64(8453) AND $owner = addr(0xPUBLISHER)"],
  ["Every layer 2 of Ethereum", "parentChainId = u64(1) AND layer = str('L2') AND $owner = addr(0xPUBLISHER)"],
  ["Search by short name", "shortName STARTSWITH str('arb') AND $owner = addr(0xPUBLISHER)"],
  ["Base's passing RPCs, fastest first", "chainId = u64(8453) AND up = true AND chainIdOk = true AND $owner = addr(0xPROBER) ORDER BY latencyMs:i32"],
  ["Chains whose ID was reused", "reusedChainId = true AND $owner = addr(0xPUBLISHER)"],
]

const BADGES: [string, string, string, string][] = [
  ["green", "badge-check", "Verified", "All seven checks pass on the latest signed release"],
  ["amber", "hourglass", "Pending anchor", "Newer than the latest signature"],
  ["red", "shield-alert", "Unverified", "Not from the publisher, or a check failed"],
  ["gray", "circle-dashed", "Not checked", "Nothing has been checked yet, or a check couldn't run"],
]

export function About() {
  const { source, snapshotAt, survey, arkiv, chains } = useStore()
  const release = useRelease()
  const [probers, setProbers] = useState<{ name: string; address: string }[] | null>(null)
  useEffect(() => {
    if (!hasPublisher) return setProbers([])
    reg.probers().then(setProbers, () => setProbers([]))
  }, [])
  const fresh: [string, string, string][] = [
    ["Chain records", source === "arkiv" ? `Live on Arkiv, ${fmt(chains.length)} networks` : arkiv.state === "importing" ? `Import running, ${fmt(arkiv.found ?? 0)} on Arkiv so far` : `Cached copy${snapshotAt ? `, ${ago(Date.parse(snapshotAt) / 1000)}` : ""}`, source === "arkiv" ? "green" : "amber"],
    ["RPC health", survey ? `One survey, ${ago(Date.parse(survey.at) / 1000)}` : probers?.length ? "Signed prober readings" : "First survey running", survey || probers?.length ? "amber" : "gray"],
    ["Latest release", release.anchor ? `Release ${release.anchor.releaseNo}, on ${ETH_NETWORK}` : "None signed yet", release.anchor ? "green" : "gray"],
    ["Publisher", publisherName ? `Named by ${publisherName}` : hasPublisher ? "Set in this site's settings" : "Not configured yet", publisherName ? "green" : hasPublisher ? "amber" : "gray"],
  ]
  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>How it works</h1>
          <p>GitHub gives you a flat list you have to trust. ChainKiv shows where each record came from, who published it, and which RPCs pass live checks.</p>
        </div>
      </div>
      <div className="grid3">
        {[
          ["01", "Copied, byte for byte", "Every file in ethereum-lists/chains becomes a public record on Arkiv, with the git hash that ties it to its source."],
          ["02", "Signed on Ethereum", "The publisher fingerprints the whole list and writes that fingerprint to Ethereum. Anyone can rebuild it from the same commit."],
          ["03", "Measured, in the open", "Probers call each RPC and sign what they saw. Readings go grey after 30 minutes and vanish after two, so a stopped prober can't leave a false green."],
        ].map(([n, t, d]) => (
          <div key={n} className="panel howto">
            <span className="n">{n}</span>
            <h2>{t}</h2>
            <p>{d}</p>
          </div>
        ))}
      </div>

      <div className="grid2eq mt">
        <Panel title="How fresh is this?" body={false}>
          {fresh.map(([k, v, c]) => (
            <div key={k} className="lrow static">
              <span className="pdot" style={{ "--c": c === "gray" ? "var(--text-4)" : `var(--${c})`, borderRadius: "50%" } as object} />
              <span className="grow">{k}</span>
              <span className="faint" style={{ fontSize: 12.5 }}>
                {v}
              </span>
            </div>
          ))}
        </Panel>
        <Panel title="What the badges mean" body={false}>
          {BADGES.map(([c, icon, t, d]) => (
            <div key={t} className="lrow static">
              <span className={`badge ${c}`} style={{ flexShrink: 0 }}>
                <I n={icon} s={12} />
                {t}
              </span>
              <span className="faint trunc" style={{ fontSize: 12.5 }}>
                {d}
              </span>
            </div>
          ))}
        </Panel>
      </div>

      <div className="grid2eq mt">
        <Panel title="Who measures the RPCs" sub="Named on ENS, so one can be added or removed without a new release" body={false}>
          {probers?.length ? (
            probers.map((p) => (
              <div key={p.address} className="lrow static">
                <span className="grow trunc">{p.name || "Listed in the signed release"}</span>
                <Addr a={p.address} n={6} />
              </div>
            ))
          ) : (
            <div className="panel-b">
              <Empty sm icon="radio" title="Named in the first release" text="In this version both probers are run by the ChainKiv team, so they aren't independent yet." />
            </div>
          )}
        </Panel>
        <Panel title="Honest limits">
          <div className="checks">
            {["In this version the publisher is the ChainKiv team, not the EthereumLists maintainers. They haven't agreed to take over yet", "Green means passed checks, never safe", "Arkiv nodes can hide health rows, though they can't fake them", "This runs on a testnet, and a reset would mean re-importing"].map((t) => (
              <div key={t} className="c warn">
                <I n="info" s={14} />
                {t}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="sech">
        <h2>Ask the data yourself</h2>
      </div>
      <p className="muted" style={{ fontSize: "var(--fs-sm)", margin: "-4px 0 12px" }}>
        No API key or account. These run against Arkiv with the command line client.
      </p>
      <div className="stack" style={{ gap: 10 }}>
        {QUERIES.map(([t, q]) => (
          <div key={t}>
            <div className="qt">{t}</div>
            <Code>{q}</Code>
          </div>
        ))}
      </div>
    </div>
  )
}
