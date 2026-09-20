/**
 * A signed check: who read this sheet, when, and proof of what they read.
 *
 * "Checked by" in a title block is a claim about a document that may have
 * changed ten times since. What a checker actually needs — and what the firm
 * needs two years later when the calculation is questioned — is the narrower
 * statement: *this exact text* was read and accepted. So signing stores a
 * hash of the source, and any later edit makes the signature stop matching.
 *
 * It is not a cryptographic identity: anyone with the browser can sign as
 * anyone, the way anyone with a pen can write a name in a box. What it does
 * rule out is the thing a pen cannot — a signature quietly surviving a change
 * to the numbers above it. The hash is computed over the text alone, so it is
 * reproducible by anybody holding the same sheet.
 */
export interface Signature {
  /** The name they signed with. */
  by: string
  /** When, as epoch milliseconds. */
  at: number
  /** SHA-256 of the source at that moment, hex. */
  hash: string
  /** The project revision it was signed against, for the printed record. */
  revision: string
}

/** Whether a signature still describes the sheet in front of you. */
export type SignatureState = 'unsigned' | 'valid' | 'stale'

const encoder = new TextEncoder()

/**
 * SHA-256 of the source, as hex.
 *
 * Deliberately the raw text with nothing normalised away: if a line's
 * whitespace changed, the sheet changed, and deciding for the checker which
 * changes were harmless is exactly the judgement we have no business making.
 */
export async function hashSource(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(source))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sign(source: string, by: string, revision: string): Promise<Signature> {
  return { by: by.trim(), at: Date.now(), hash: await hashSource(source), revision }
}

export async function checkSignature(
  source: string,
  signature: Signature | undefined,
): Promise<SignatureState> {
  if (!signature?.hash) return 'unsigned'
  return (await hashSource(source)) === signature.hash ? 'valid' : 'stale'
}

/** Short enough to print in a title block, long enough that two sheets differ. */
export const shortHash = (hash: string): string => hash.slice(0, 12)

/**
 * What the sheet says about its signature, in words that print.
 *
 * The stale case is the one that matters, so it says plainly what happened
 * rather than showing a red icon somebody has to interpret.
 */
export function signatureLine(state: SignatureState, signature?: Signature): string {
  if (state === 'unsigned' || !signature) return ''
  const when = new Date(signature.at).toISOString().slice(0, 10)
  if (state === 'valid') {
    return `Checked by ${signature.by} on ${when} — signature ${shortHash(signature.hash)}`
  }
  return (
    `Signed by ${signature.by} on ${when}, but the sheet has been edited since. ` +
    'The signature no longer applies — it needs checking again.'
  )
}

/** Only keep a signature that is actually one, when reading a stored sheet. */
export function cleanSignature(raw: unknown): Signature | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const candidate = raw as Partial<Signature>
  if (typeof candidate.hash !== 'string' || !/^[0-9a-f]{64}$/.test(candidate.hash)) return undefined
  if (typeof candidate.by !== 'string' || typeof candidate.at !== 'number') return undefined
  return {
    by: candidate.by,
    at: candidate.at,
    hash: candidate.hash,
    revision: typeof candidate.revision === 'string' ? candidate.revision : '',
  }
}
