// A release's copy on Swarm, as this site sees it. The reference comes from the publisher's record on Arkiv, so every
// visitor sees the same one, and anyone can check it. Saving needs the publisher's key, so it only runs on their machine.
import { reg } from "./registry"

/** The dev server holds the keys. A deployed site has none, so it can only read. */
export const canSave = import.meta.env.DEV

export type Copy = { reference: string; uploadedAt: number }

export const readCopy = (root: string): Promise<Copy | null> => reg.swarmCopy(root)

export async function saveCopy(): Promise<string> {
  // The header is one a page on another site can't send, so only this app can spend the stamp.
  const response = await fetch("/__swarm-save", { method: "POST", headers: { "x-chainroll": "1" } }).catch(() => null)
  if (!response) throw new Error("The dev server didn't answer")
  const body = (await response.json().catch(() => ({}))) as { reference?: string; error?: string }
  if (!response.ok || !body.reference) throw new Error(body.error ?? "The upload failed")
  return body.reference
}
