"use client"

import ProofUpload, { ProofUploadProps } from "@modules/manual-transfer/core/components/proof-upload"
import { useRouter } from "next/navigation"

/** The core upload form; afterwards the page reloads its data (status, proofs) */
export default function RefreshingProofUpload(props: ProofUploadProps) {
  const router = useRouter()
  return <ProofUpload {...props} onUploaded={() => router.refresh()} />
}
