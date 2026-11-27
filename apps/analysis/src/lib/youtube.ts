/* Parsing helpers for YouTube caption files. */

function decodeEntities(input: string): string {
  const once = (value: string) =>
    value
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
        String.fromCodePoint(parseInt(hex, 16))
      )
      .replace(/&#(\d+);/g, (_, dec: string) =>
        String.fromCodePoint(parseInt(dec, 10))
      )
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");

  // Captions are sometimes escaped twice, for example "&amp;#39;".
  return once(once(input));
}

export function parseCaptionXml(xml: string): string[] {
  const pieces: string[] = [];

  for (const match of xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)) {
    pieces.push(decodeEntities(match[1]));
  }

  if (pieces.length === 0) {
    for (const match of xml.matchAll(/<p\s[^>]*>([\s\S]*?)<\/p>/g)) {
      pieces.push(decodeEntities(match[1].replace(/<[^>]+>/g, "")));
    }
  }

  return pieces
    .map((piece) => piece.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
