/*
 * Transcript reference, for example GT-7K3M9Q.
 * Pattern: GT- followed by 6 characters from a 31 character alphabet
 * (no 0, O, 1, I or L, which are easy to confuse). About 887 million
 * combinations. Works in the browser and on the server.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 6;

export const REF_PATTERN = /^GT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function generateRef(): string {
  const limit = 256 - (256 % ALPHABET.length);
  const chars: string[] = [];

  while (chars.length < LENGTH) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte < limit && chars.length < LENGTH) {
        chars.push(ALPHABET[byte % ALPHABET.length]);
      }
    }
  }

  return `GT-${chars.join("")}`;
}
