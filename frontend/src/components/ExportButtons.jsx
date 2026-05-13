import { useState } from "react";
import { Copy, Download, Printer, Check, ChevronDown } from "lucide-react";
import { rewriteReferences, formatCitation } from "../utils/citations";

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

  const handlePrint = () => {
    window.print();
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
        Download .md
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

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "article";
}
