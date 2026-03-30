// Recursive character text splitter
// Splits on paragraph breaks, then sentence breaks, then words.
const SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

function splitByLength(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    out.push(text.slice(i, i + size));
  }
  return out;
}

function merge(splits: string[], size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const split of splits) {
    if ((current + split).length <= size) {
      current += split;
    } else {
      if (current.length > 0) chunks.push(current.trim());
      // Start new chunk keeping trailing overlap from previous
      const overlapText = current.length > overlap ? current.slice(-overlap) : current;
      current = overlapText + split;
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks;
}

function recursiveSplit(text: string, separators: string[], size: number): string[] {
  const [sep, ...rest] = separators;
  if (!sep && sep !== '') return splitByLength(text, size);

  const parts = text.split(sep);
  const goodParts: string[] = [];
  const badParts: string[] = [];

  for (const part of parts) {
    if (part.length <= size) {
      goodParts.push(part + (sep === '' ? '' : sep));
    } else {
      if (goodParts.length > 0) {
        badParts.push(...goodParts.splice(0));
      }
      badParts.push(...recursiveSplit(part, rest, size));
    }
  }
  badParts.push(...goodParts);
  return badParts;
}

/**
 * Split text into overlapping chunks using recursive character splitting.
 * Tries paragraph breaks first, then sentences, then words, then raw characters.
 *
 * @param text - The input text to split into chunks
 * @param chunkSize - Target maximum characters per chunk (default: 2000)
 * @param overlap - Number of overlapping characters between consecutive chunks (default: 200)
 * @returns An array of text chunks, each roughly `chunkSize` characters, filtered to exclude trivially short chunks
 */
export function splitText(text: string, chunkSize = 2000, overlap = 200): string[] {
  const raw = recursiveSplit(text, SEPARATORS, chunkSize);
  return merge(raw, chunkSize, overlap).filter((c) => c.trim().length > 20);
}
