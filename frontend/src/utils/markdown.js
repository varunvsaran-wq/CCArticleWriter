import { marked } from "marked";
import TurndownService from "turndown";

// ── Markdown → HTML (for loading into TipTap) ──────────────

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function markdownToHtml(md) {
  if (!md) return "";
  return marked.parse(md);
}

// ── HTML → Markdown (for saving from TipTap) ──────────────

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
  linkStyle: "inlined",
});

// GFM tables / strikethrough
turndown.addRule("strikethrough", {
  filter: ["del", "s"],
  replacement: (content) => `~~${content}~~`,
});

export function htmlToMarkdown(html) {
  if (!html) return "";
  return turndown.turndown(html).trim();
}

// ── Section extraction (for section-scoped revisions) ──────

/**
 * Parse top-level (## H2) section titles from article markdown.
 * Skips the References section.
 */
export function extractSections(md) {
  if (!md) return [];
  const sections = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      const title = m[1].trim();
      if (!/^references?$/i.test(title)) {
        sections.push(title);
      }
    }
  }
  return sections;
}

// ── References split / reassemble ─────────────────────────

const REF_HEADING_RE = /\n##\s+References\s*\n/i;

/**
 * Split article content into editable body and the references section.
 * The references section is regenerated from `sources` on every save, so
 * the editor only ever shows / edits the body.
 */
export function splitBodyAndRefs(content) {
  if (!content) return { body: "", refs: "" };
  const match = content.match(REF_HEADING_RE);
  if (!match) return { body: content.trim(), refs: "" };
  const idx = match.index;
  return {
    body: content.slice(0, idx).trim(),
    refs: content.slice(idx).trim(),
  };
}

export function countWords(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}
