import { cleanFilename, detectProofType, MAX_PROOF_BYTES, sha256 } from "../proof-file"

const bytes = (...values: number[]) => Uint8Array.from(values)

describe("detectProofType", () => {
  it("recognises JPG, PNG and PDF by their first bytes", () => {
    expect(detectProofType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg")
    expect(detectProofType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png")
    expect(detectProofType(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf")
  })

  it("rejects everything else, whatever the name says", () => {
    expect(detectProofType(Buffer.from("GIF89a"))).toBeNull()
    expect(detectProofType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull()
    expect(detectProofType(Buffer.from("<html><script>alert(1)</script>"))).toBeNull()
    expect(detectProofType(Buffer.from("PK\u0003\u0004"))).toBeNull()
    // PNG signature cut short, PDF marker not at the start
    expect(detectProofType(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull()
    expect(detectProofType(Buffer.from(" %PDF-1.7"))).toBeNull()
    expect(detectProofType(bytes())).toBeNull()
  })

  it("caps proofs at 5 MB", () => {
    expect(MAX_PROOF_BYTES).toBe(5 * 1024 * 1024)
  })
})

describe("cleanFilename", () => {
  it("keeps the base name and forces the detected extension", () => {
    expect(cleanFilename("transfer bca.JPG", "image/jpeg")).toBe("transfer bca.jpg")
    expect(cleanFilename("bukti.exe", "application/pdf")).toBe("bukti.pdf")
    expect(cleanFilename("receipt", "image/png")).toBe("receipt.png")
  })

  it("drops paths, control characters and quotes", () => {
    expect(cleanFilename("C:\\Users\\me\\..\\proof.png", "image/png")).toBe("proof.png")
    expect(cleanFilename('../../etc/"pass\u0000wd<>.pdf', "application/pdf")).toBe("passwd.pdf")
  })

  it("falls back to a neutral name and limits the length", () => {
    expect(cleanFilename(undefined, "image/jpeg")).toBe("payment-proof.jpg")
    expect(cleanFilename(".png", "image/png")).toBe("payment-proof.png")
    expect(cleanFilename("a".repeat(300) + ".png", "image/png")).toHaveLength(104)
  })
})

describe("sha256", () => {
  it("hashes the content", () => {
    expect(sha256(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
})
