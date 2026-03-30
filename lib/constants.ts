// ── Application constants ────────────────────────────────────────────────────

/** Max PDF file size in bytes (3.5 MB) */
export const MAX_PDF_SIZE_BYTES = 3.5 * 1024 * 1024;

/** Number of chunks to process per embedding batch */
export const EMBEDDING_BATCH_SIZE = 96;

/** Max tool-calling steps in chat */
export const MAX_TOOL_STEPS = 5;

/** Max chunks returned by search */
export const MAX_SEARCH_CHUNKS = 12;

/** Default page size for list endpoints */
export const DEFAULT_PAGE_SIZE = 50;

/** Max page size for list endpoints */
export const MAX_PAGE_SIZE = 200;

/** JSON anchors for finding Claude's response JSON */
export const JSON_ANCHORS = [
  '{"accounts"', '{"properties"',
  '{  "accounts"', '{  "properties"',
  '{ "accounts"', '{ "properties"',
] as const;
