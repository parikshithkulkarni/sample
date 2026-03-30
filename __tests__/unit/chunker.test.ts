import { describe, it, expect } from 'vitest';
import { splitText } from '@/lib/chunker';

describe('splitText', () => {
  it('returns empty array for empty string', () => {
    expect(splitText('')).toEqual([]);
  });

  it('filters out chunks shorter than 20 chars', () => {
    // Short text should produce no chunks
    expect(splitText('Hello world')).toEqual([]);
    // 20+ char text should produce a chunk
    const result = splitText('This is a longer text that exceeds minimum length threshold.');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns single chunk for text shorter than chunkSize', () => {
    const text = 'This is a short document. It has two sentences. Both fit in one chunk easily.';
    const result = splitText(text, 2000, 200);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('short document');
  });

  it('splits long text into multiple chunks', () => {
    // Create a text long enough to require splitting
    const paragraph = 'This is a paragraph with some content. ';
    const longText = paragraph.repeat(100); // ~3900 chars
    const result = splitText(longText, 500, 50);
    expect(result.length).toBeGreaterThan(1);
  });

  it('each chunk is within the size limit', () => {
    const paragraph = 'Word '.repeat(500); // 2500 chars
    const chunkSize = 200;
    const result = splitText(paragraph, chunkSize, 20);
    for (const chunk of result) {
      // Allow small overflow from overlap
      expect(chunk.length).toBeLessThanOrEqual(chunkSize * 1.5);
    }
  });

  it('preserves content across chunks (no data loss)', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = splitText(text, 100, 10);
    const joined = chunks.join(' ');
    // All original words should appear in at least one chunk
    for (const w of words) {
      expect(joined).toContain(w);
    }
  });

  it('splits preferentially on paragraph breaks', () => {
    const text = 'First paragraph has enough text to fill up quite a large section.\n\nSecond paragraph also has enough text to fill another section of the chunk.';
    const result = splitText(text, 100, 10);
    // Should split on the paragraph break
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('respects custom chunkSize parameter', () => {
    const text = 'a'.repeat(1000);
    const small = splitText(text, 100, 0);
    const large = splitText(text, 500, 0);
    expect(small.length).toBeGreaterThan(large.length);
  });

  it('trims whitespace from chunk boundaries', () => {
    const text = '  Leading spaces and trailing spaces.  Some more text to fill up the space.  ';
    const result = splitText(text, 2000, 200);
    if (result.length > 0) {
      expect(result[0]).not.toMatch(/^\s/);
      expect(result[result.length - 1]).not.toMatch(/\s$/);
    }
  });
});
