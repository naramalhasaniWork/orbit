/**
 * Document Chunker — splits content into ~500 token chunks for embedding.
 * Supports markdown (header-based), plain text (paragraph-based),
 * and JSON (top-level key-based) chunking strategies.
 */

interface ChunkMetadata {
  startLine?: number;
  endLine?: number;
  section?: string;
}

export interface Chunk {
  content: string;
  index: number;
  metadata: ChunkMetadata;
}

const DEFAULT_MAX_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const CHARS_PER_TOKEN = 4;

function tokensToChars(tokens: number): number {
  return tokens * CHARS_PER_TOKEN;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split text into chunks that fit within the token budget.
 * Preserves overlap between consecutive chunks for context continuity.
 */
function splitWithOverlap(
  segments: Array<{ content: string; section?: string; startLine?: number }>,
  maxTokens: number
): Chunk[] {
  const chunks: Chunk[] = [];
  const maxChars = tokensToChars(maxTokens);
  const overlapChars = tokensToChars(OVERLAP_TOKENS);
  let currentContent = "";
  let currentSection: string | undefined;
  let currentStartLine: number | undefined;

  for (const segment of segments) {
    const segmentTokens = estimateTokens(segment.content);

    // If single segment exceeds budget, split it further
    if (segmentTokens > maxTokens) {
      // Flush current buffer first
      if (currentContent.trim()) {
        chunks.push({
          content: currentContent.trim(),
          index: chunks.length,
          metadata: { section: currentSection, startLine: currentStartLine },
        });
        currentContent = "";
      }

      const words = segment.content.split(/\s+/);
      let buffer = "";
      for (const word of words) {
        const next = buffer ? `${buffer} ${word}` : word;
        if (estimateTokens(next) > maxTokens && buffer) {
          chunks.push({
            content: buffer.trim(),
            index: chunks.length,
            metadata: { section: segment.section, startLine: segment.startLine },
          });
          // Keep overlap from end of previous chunk
          const overlapText = buffer.slice(-overlapChars);
          buffer = overlapText ? `${overlapText} ${word}` : word;
        } else {
          buffer = next;
        }
      }
      if (buffer.trim()) {
        currentContent = buffer;
        currentSection = segment.section;
        currentStartLine = segment.startLine;
      }
      continue;
    }

    const combined = currentContent
      ? `${currentContent}\n\n${segment.content}`
      : segment.content;

    if (estimateTokens(combined) > maxTokens && currentContent.trim()) {
      chunks.push({
        content: currentContent.trim(),
        index: chunks.length,
        metadata: { section: currentSection, startLine: currentStartLine },
      });
      // Keep overlap from end of previous chunk
      const overlapText = currentContent.trim().slice(-overlapChars);
      currentContent = overlapText
        ? `${overlapText}\n\n${segment.content}`
        : segment.content;
      currentSection = segment.section;
      currentStartLine = segment.startLine;
    } else {
      currentContent = combined;
      if (!currentSection) {
        currentSection = segment.section;
        currentStartLine = segment.startLine;
      }
    }
  }

  if (currentContent.trim()) {
    chunks.push({
      content: currentContent.trim(),
      index: chunks.length,
      metadata: { section: currentSection, startLine: currentStartLine },
    });
  }

  return chunks;
}

/** Chunk markdown by headers (# ## ###), then split oversized sections. */
function chunkMarkdown(content: string, maxTokens: number): Chunk[] {
  const lines = content.split("\n");
  const segments: Array<{ content: string; section?: string; startLine: number }> = [];
  let currentLines: string[] = [];
  let currentSection: string | undefined;
  let sectionStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/);

    if (headerMatch && currentLines.length > 0) {
      segments.push({
        content: currentLines.join("\n"),
        section: currentSection,
        startLine: sectionStart,
      });
      currentLines = [line];
      currentSection = headerMatch[1].trim();
      sectionStart = i;
    } else {
      if (headerMatch) {
        currentSection = headerMatch[1].trim();
        sectionStart = i;
      }
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    segments.push({
      content: currentLines.join("\n"),
      section: currentSection,
      startLine: sectionStart,
    });
  }

  return splitWithOverlap(segments, maxTokens);
}

/** Chunk plain text by double newlines (paragraphs). */
function chunkPlainText(content: string, maxTokens: number): Chunk[] {
  const paragraphs = content.split(/\n\n+/);
  let lineCount = 0;

  const segments = paragraphs.map((p) => {
    const startLine = lineCount;
    lineCount += p.split("\n").length + 1;
    return { content: p.trim(), startLine };
  }).filter((s) => s.content.length > 0);

  return splitWithOverlap(segments, maxTokens);
}

/** Chunk JSON by top-level keys. */
function chunkJson(content: string, maxTokens: number): Chunk[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // If JSON parsing fails, fall back to plain text chunking
    return chunkPlainText(content, maxTokens);
  }

  // If it's an array or primitive, treat as plain text
  if (Array.isArray(parsed) || typeof parsed !== "object" || parsed === null) {
    return chunkPlainText(content, maxTokens);
  }

  const segments = Object.entries(parsed).map(([key, value]) => ({
    content: JSON.stringify({ [key]: value }, null, 2),
    section: key,
    startLine: 0,
  }));

  return splitWithOverlap(segments, maxTokens);
}

/** Detect file type from name/extension and choose chunking strategy. */
function detectStrategy(fileName: string): "markdown" | "json" | "text" {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "md" || ext === "mdx") return "markdown";
  if (ext === "json") return "json";
  return "text";
}

/**
 * Chunk a document into ~500 token pieces for embedding.
 * Automatically detects the best chunking strategy from the file name.
 */
export function chunkDocument(
  content: string,
  fileName: string,
  maxTokens: number = DEFAULT_MAX_TOKENS
): Chunk[] {
  if (!content.trim()) return [];

  const strategy = detectStrategy(fileName);

  switch (strategy) {
    case "markdown":
      return chunkMarkdown(content, maxTokens);
    case "json":
      return chunkJson(content, maxTokens);
    default:
      return chunkPlainText(content, maxTokens);
  }
}
