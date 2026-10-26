import { createHash } from "node:crypto"

/**
 * Payment proof files: JPG, PNG or PDF up to 5 MB, recognised by their first
 * bytes. The file name and the type the browser sends are never trusted.
 */

export const MAX_PROOF_BYTES = 5 * 1024 * 1024

export type ProofMimeType = "image/jpeg" | "image/png" | "application/pdf"

const SIGNATURES: { mime: ProofMimeType; bytes: number[]; extension: string }[] = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff], extension: "jpg" },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], extension: "png" },
  // "%PDF-"
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], extension: "pdf" },
]

export function detectProofType(content: Uint8Array): ProofMimeType | null {
  const match = SIGNATURES.find(
    ({ bytes }) => content.length >= bytes.length && bytes.every((byte, i) => content[i] === byte)
  )
  return match?.mime ?? null
}

export function extensionFor(mime: ProofMimeType): string {
  return SIGNATURES.find((s) => s.mime === mime)!.extension
}

/**
 * A display name: no path, no control or quote characters, at most 120
 * characters, ending in the extension of the detected type.
 */
export function cleanFilename(original: string | undefined, mime: ProofMimeType): string {
  const extension = extensionFor(mime)
  const base = (original ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f"<>]/g, "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .trim()
    .slice(0, 100)
  return `${base || "payment-proof"}.${extension}`
}

export function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex")
}
