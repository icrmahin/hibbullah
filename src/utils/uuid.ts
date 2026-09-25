/**
 * RFC 4122 version 4 identifier, without pulling in a native crypto module.
 *
 * The product id has to exist client-side *before* the row is inserted, so the
 * product image can be uploaded to a stable Cloudinary public_id
 * (`products/<id>`) and the single insert carries the final URL. That needs a
 * uuid at pick time, and `expo-crypto` would force a native rebuild for it.
 *
 * Uses crypto.getRandomValues when the runtime provides it (Hermes and modern
 * webviews do) and falls back to Math.random. This is a row identifier, not a
 * secret: a collision is caught by the products primary key and surfaces as an
 * insert error rather than silently overwriting a product.
 */

const HEX = '0123456789abcdef'

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes)
    return bytes
  }
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256)
  }
  return bytes
}

export function randomUuid(): string {
  const bytes = randomBytes(16)
  // Version 4, variant 10xx.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  let out = ''
  for (let i = 0; i < 16; i += 1) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += '-'
    out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f]
  }
  return out
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value?: string | null): boolean {
  return !!value && UUID_PATTERN.test(value)
}
