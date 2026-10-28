// Bounds for the segment prototype, shared by UI, schemas, extraction and allocation.
export const LIMITS = {
  headcount: 100,
  segments: 12,
  assignmentLines: 180,
  searchStates: 50_000,
  extractionCharacters: 8_000,
  extractionTokens: 4_000,
  extractionCalls: 20,
  extractionTimeoutMs: 30_000,
} as const;
