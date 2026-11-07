import { execSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { privateKeyToAddress } from "viem/accounts"
import { defineConfig, loadEnv } from "vite"

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

export default defineConfig(({ mode, command }) => {
  // Reads the repo's .env.local. Only VITE_ values and the addresses below reach the browser, never a key.
  const env = loadEnv(mode, repo, "")
  const key = env.ARKIV_ACCESS_KEY
  const github = command === "serve" ? githubToken(env) : ""
  return {
    root: here,
    envDir: repo,
    plugins: [react()],
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
