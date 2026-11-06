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

export default defineConfig(({ mode }) => {
  // Reads the repo's .env.local. Only VITE_ values and the addresses below reach the browser, never a key.
  const env = loadEnv(mode, repo, "")
  const key = env.ARKIV_ACCESS_KEY
  return {
    root: here,
    envDir: repo,
    plugins: [react()],
    resolve: { conditions: ["browser"] },
    define: {
      "import.meta.env.VITE_CHAINKIV_PUBLISHER": JSON.stringify(env.VITE_CHAINKIV_PUBLISHER || addressOf(env.PUBLISHER_KEY)),
      "import.meta.env.VITE_CHAINKIV_VALIDATOR": JSON.stringify(env.VITE_CHAINKIV_VALIDATOR || addressOf(env.VALIDATOR_KEY)),
      "import.meta.env.VITE_ARKIV_PROXY": JSON.stringify(mode === "development" && key ? "1" : ""),
    },
    server: {
      port: 5174,
      // Local development only: forwards reads with the access key added on this machine.
      proxy: key ? { "/arkiv-rpc": { target: `https://${RPC_HOST}`, changeOrigin: true, rewrite: () => `/${encodeURIComponent(key)}` } } : undefined,
    },
    build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1600 },
  }
})
