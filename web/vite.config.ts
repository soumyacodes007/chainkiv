import { execSync, spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { privateKeyToAddress } from "viem/accounts"
import { defineConfig, loadEnv, type Plugin } from "vite"

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, "..")
const RPC_HOST = "rpc.rabdi.db-chain.testnet.arkiv.network"

const addressOf = (key?: string) => {
  try {
    return key ? privateKeyToAddress((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`) : ""
  } catch {
    return ""
  }
}

/** This machine's GitHub login. Used only by the dev server below, and never placed in the bundle. */
const githubToken = (env: Record<string, string>) => {
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN
  try {
    return execSync("gh auth token", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return ""
  }
}

/** Local only: Save to Swarm needs the publisher's key, which stays on this machine and never reaches the browser. */
const swarmSave = (): Plugin => ({
  name: "chainroll-swarm-save",
  apply: "serve",
  configureServer(server) {
    const route = (path: string, command: string) => server.middlewares.use(path, (req, res) => {
      const reply = (status: number, body: object) => {
        res.statusCode = status
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify(body))
      }
      // A page on another site can't set this header without permission, so it can't spend the stamp.
      if (req.method !== "POST" || req.headers["x-chainroll"] !== "1") return reply(403, { error: "Not allowed" })
      let out = ""
      let err = ""
      const job = spawn(`bun run --conditions browser src/cli.ts ${command}`, { cwd: repo, shell: true })
      job.stdout.on("data", (d) => (out += d))
      job.stderr.on("data", (d) => (err += d))
      job.on("close", (code) => {
        const reference = /"reference":\s*"([0-9a-f]+)"/.exec(out)?.[1]
        if (code === 0 && reference) reply(200, { reference })
        else reply(500, { error: err.trim().split("\n").at(-1)?.slice(0, 200) || "The upload failed" })
      })
    })
    route("/__swarm-save", "swarm-save")
    route("/__swarm-archive", "swarm-archive")
  },
})

export default defineConfig(({ mode, command }) => {
  // Reads the repo's .env.local. Only VITE_ values and the addresses below reach the browser, never a key.
  const env = loadEnv(mode, repo, "")
  const key = env.ARKIV_ACCESS_KEY
  const github = command === "serve" ? githubToken(env) : ""
  return {
    root: here,
    envDir: repo,
    plugins: [react(), swarmSave()],
    resolve: { conditions: ["browser"] },
    define: {
      "import.meta.env.VITE_CHAINKIV_PUBLISHER": JSON.stringify(env.VITE_CHAINKIV_PUBLISHER || addressOf(env.PUBLISHER_KEY)),
      "import.meta.env.VITE_CHAINKIV_VALIDATOR": JSON.stringify(env.VITE_CHAINKIV_VALIDATOR || addressOf(env.VALIDATOR_KEY)),
      "import.meta.env.VITE_ARKIV_PROXY": JSON.stringify(mode === "development" && key ? "1" : ""),
      "import.meta.env.VITE_GITHUB_PROXY": JSON.stringify(github ? "1" : ""),
    },
    server: {
      port: 5174,
      // Local development only: forwards reads with the access key added on this machine.
      proxy: {
        ...(key ? { "/arkiv-rpc": { target: `https://${RPC_HOST}`, changeOrigin: true, rewrite: () => `/${encodeURIComponent(key)}` } } : {}),
        // Only ever this one public question, so the login behind it can't be used for anything else.
        ...(github
          ? {
              "/github-compare": {
                target: "https://api.github.com",
                changeOrigin: true,
                headers: { authorization: `Bearer ${github}`, "user-agent": "chainroll-dev" },
                rewrite: (path: string) => (/^\/github-compare\/[0-9a-f]{40}\.\.\.[\w-]+$/.test(path) ? path.replace("/github-compare/", "/repos/ethereum-lists/chains/compare/") : "/404"),
              },
            }
          : {}),
      },
    },
    build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1600 },
  }
})
