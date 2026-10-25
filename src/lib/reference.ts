import { MedusaError } from "@medusajs/framework/utils"
import { randomInt } from "node:crypto"

/**
 * Payment reference codes buyers put in the transfer note, e.g. "MT-7K3QX-9PA2B".
 *
 * Nine random symbols from Crockford's base32 alphabet (no I, L, O, U, so they
 * survive being read over the phone or retyped from a screenshot) plus one
 * Luhn mod 32 check symbol that catches every single-symbol typo and most
 * swapped neighbours. 45 random bits keep collisions negligible: about 1 in
 * 7,000 after 100,000 orders.
 */

export const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
export const DEFAULT_REFERENCE_PREFIX = "MT"
const RANDOM_LENGTH = 9
const PREFIX_PATTERN = /^[A-Z0-9]{1,6}$/

export function isValidReferencePrefix(prefix: string): boolean {
  return PREFIX_PATTERN.test(prefix)
}

function codePoint(symbol: string): number {
  const value = REFERENCE_ALPHABET.indexOf(symbol)
  if (value < 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `"${symbol}" is not a reference symbol`)
  }
  return value
}

/** Luhn mod N check symbol over the given symbols */
export function checkSymbol(symbols: string): string {
  const n = REFERENCE_ALPHABET.length
  let factor = 2
  let sum = 0
  for (let i = symbols.length - 1; i >= 0; i--) {
    let addend = factor * codePoint(symbols[i])
    factor = factor === 2 ? 1 : 2
    addend = Math.floor(addend / n) + (addend % n)
    sum += addend
  }
  return REFERENCE_ALPHABET[(n - (sum % n)) % n]
}

export function generateReference(
  prefix: string = DEFAULT_REFERENCE_PREFIX,
  random: (max: number) => number = randomInt
): string {
  let body = ""
  for (let i = 0; i < RANDOM_LENGTH; i++) {
    body += REFERENCE_ALPHABET[random(REFERENCE_ALPHABET.length)]
  }
  body += checkSymbol(body)
  return `${prefix}-${body.slice(0, 5)}-${body.slice(5)}`
}

/**
 * Normalises what a buyer or admin typed (case, spaces, look-alike letters)
 * and checks the check symbol. Returns the canonical code or null.
 */
export function parseReference(input: string): string | null {
  const match = /^\s*([A-Za-z0-9]{1,6})[\s-]*([A-Za-z0-9]{5})[\s-]*([A-Za-z0-9]{5})\s*$/.exec(input)
  if (!match) {
    return null
  }
  const prefix = match[1].toUpperCase()
  const body = (match[2] + match[3])
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
  if (/[^0-9A-HJKMNP-TV-Z]/.test(body)) {
    return null
  }
  if (checkSymbol(body.slice(0, RANDOM_LENGTH)) !== body[RANDOM_LENGTH]) {
    return null
  }
  return `${prefix}-${body.slice(0, 5)}-${body.slice(5)}`
}
