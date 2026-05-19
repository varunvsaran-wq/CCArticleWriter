import { useState } from "react";
import { Copy, Download, Printer, Check, ChevronDown, Sigma } from "lucide-react";
import { marked } from "marked";
import { rewriteReferences } from "../utils/citations";
import { markdownToLatex } from "../utils/latex";

const CITATION_STYLES = [
  { value: "inline", label: "Inline Links" },
  { value: "footnote", label: "Footnotes" },
  { value: "apa", label: "APA" },
  { value: "mla", label: "MLA" },
  { value: "chicago", label: "Chicago" },
  { value: "ieee", label: "IEEE" },
];

export default function ExportButtons({ article, citationStyle, onCitationStyleChange }) {
  const [copied, setCopied] = useState(false);

  const getFormattedContent = () => {
    if (!article) return "";
    return rewriteReferences(article.content, article.sources, citationStyle);
  };

  const handleCopy = async () => {
    const text = getFormattedContent();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMd = () => {
    const text = getFormattedContent();
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(article.title)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTex = () => {
    if (!article) return;
    const md = getFormattedContent();
    const tex = markdownToLatex(md, article.title);
    const blob = new Blob([tex], { type: "application/x-tex;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(article.title)}.tex`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!article) return;

    const fullMarkdown = getFormattedContent();

    // Split body vs. references so we don't superscript-ify [N] labels in the refs list
    const refsIdx = fullMarkdown.indexOf("## References");
    const bodyMd = refsIdx >= 0 ? fullMarkdown.slice(0, refsIdx) : fullMarkdown;
    const refsMd = refsIdx >= 0 ? fullMarkdown.slice(refsIdx) : "";

    let bodyHtml = marked.parse(bodyMd);
    bodyHtml = bodyHtml.replace(/\[(\d+)\]/g, '<sup class="cite">[$1]</sup>');
    const refsHtml = refsMd ? marked.parse(refsMd) : "";

    const doc = buildPrintDocument(article.title, bodyHtml + refsHtml);

    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) {
      alert("Allow popups to print the article.");
      return;
    }
    w.document.open();
    w.document.write(doc);
    w.document.close();

    const triggerPrint = () => {
      w.focus();
      w.print();
    };

    // Some browsers fire load before the body is fully laid out; do both
    if (w.document.readyState === "complete") {
      setTimeout(triggerPrint, 100);
    } else {
      w.onload = () => setTimeout(triggerPrint, 100);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Citation style switcher */}
      <div className="relative flex-shrink-0">
        <label className="text-xs text-gray-500 mr-1 font-medium">Citations:</label>
        <div className="relative inline-block">
          <select
            value={citationStyle}
            onChange={(e) => onCitationStyleChange(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-1.5 pr-7 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {CITATION_STYLES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      <div className="w-px h-5 bg-gray-200 hidden sm:block" />

      {/* Action buttons */}
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
        {copied ? "Copied!" : "Copy"}
      </button>

      <button
        onClick={handleDownloadMd}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Download size={13} />
        .md
      </button>

      <button
        onClick={handleDownloadTex}
        title="Download as LaTeX source"
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Sigma size={13} />
        .tex
      </button>

      <button
        onClick={handlePrint}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Printer size={13} />
        Print / PDF
      </button>
    </div>
  );
}

// ── Print helpers ──────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function buildPrintDocument(title, htmlBody) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title || "Article")}</title>
<style>
  @page { margin: 1in; }
  html, body { background: #fff; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #111;
    max-width: 7in;
    margin: 0 auto;
    padding: 0.5in 0;
  }
  h1 { font-size: 22pt; line-height: 1.25; margin: 0 0 0.6em; }
  h2 { font-size: 16pt; margin: 1.5em 0 0.5em; border-bottom: 1pt solid #ccc; padding-bottom: 0.15em; }
  h3 { font-size: 13pt; margin: 1.2em 0 0.4em; }
  p  { margin: 0 0 0.8em; }
  ul, ol { margin: 0 0 0.8em 1.5em; }
  li { margin-bottom: 0.25em; }
  blockquote {
    border-left: 3pt solid #888;
    margin: 0.7em 0;
    padding: 0.1em 0 0.1em 0.8em;
    color: #555;
    font-style: italic;
  }
  code {
    font-family: Menlo, Consolas, "Courier New", monospace;
    font-size: 10.5pt;
    background: #f4f4f4;
    padding: 1pt 3pt;
    border-radius: 2pt;
  }
  pre {
    background: #f4f4f4;
    padding: 0.7em;
    border-radius: 3pt;
    font-size: 10pt;
    overflow-x: auto;
    page-break-inside: avoid;
  }
  pre code { background: none; padding: 0; }
  hr { border: 0; border-top: 1pt solid #ccc; margin: 1.5em 0; }
  a { color: #1f3fa3; text-decoration: underline; word-break: break-word; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 11pt; }
  th, td { border: 1pt solid #ccc; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; }
  sup.cite {
    color: #1f3fa3;
    font-weight: 600;
    font-size: 0.7em;
    margin-left: 1pt;
    vertical-align: super;
    line-height: 0;
  }
  /* Keep headings with following content */
  h1, h2, h3 { page-break-after: avoid; }
  img { max-width: 100%; }
  @media print {
    body { padding: 0; max-width: none; }
    a { color: inherit; }
  }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "article";
}
