import { useMemo, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { rewriteReferences, formatCitation } from "../utils/citations";

export default function ArticleViewer({ article, citationStyle }) {
  const refsRef = useRef(null);

  const processedContent = useMemo(() => {
    if (!article) return "";
    return rewriteReferences(article.content, article.sources, citationStyle);
  }, [article, citationStyle]);

  // Handle citation marker clicks → scroll to references
  useEffect(() => {
    const handler = (e) => {
      const marker = e.target.closest("[data-ref]");
      if (marker) {
        refsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  if (!article) return null;

  return (
    <div className="space-y-6">
      {/* Meta bar */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span className="bg-gray-100 px-2 py-1 rounded">
          {article.word_count.toLocaleString()} words
        </span>
        <span className="bg-gray-100 px-2 py-1 rounded capitalize">
          {article.content_type.replace("_", " ")}
        </span>
        <span className="bg-gray-100 px-2 py-1 rounded">
          {article.sources.length} sources
        </span>
        <span className="text-gray-300">·</span>
        <span>{new Date(article.created_at).toLocaleDateString()}</span>
      </div>

      {/* Article body */}
      <div className="article-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Render citation markers as superscripts
            p: ({ children }) => {
              return (
                <p>
                  {processCitationsInChildren(children)}
                </p>
              );
            },
            // Open external links in new tab
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>

      {/* Sources panel */}
      {article.sources.length > 0 && (
        <div ref={refsRef} className="border-t border-gray-200 pt-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Sources
          </h2>
          <ol className="space-y-3">
            {article.sources.map((src, i) => (
              <li key={src.id} className="flex gap-3 text-sm" id={`ref-${i + 1}`}>
                <span className="text-indigo-500 font-mono font-semibold flex-shrink-0 w-6 text-right">
                  [{i + 1}]
                </span>
                <div className="min-w-0">
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-indigo-600 hover:text-indigo-800 underline break-words"
                  >
                    {src.title}
                  </a>
                  <p className="text-gray-500 mt-0.5 text-xs leading-snug">
                    {formatCitation(src, citationStyle)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/**
 * Walk react children and convert [N] text into citation superscripts.
 */
function processCitationsInChildren(children) {
  if (typeof children === "string") return inlineCitations(children);
  if (!Array.isArray(children)) return children;
  return children.map((child, i) => {
    if (typeof child === "string") return inlineCitations(child, i);
    return child;
  });
}

function inlineCitations(text, key) {
  const parts = text.split(/(\[\d+\])/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      return (
        <sup key={`${key}-${i}`}>
          <a
            href={`#ref-${match[1]}`}
            className="citation-marker"
            title={`Source ${match[1]}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`ref-${match[1]}`)?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            [{match[1]}]
          </a>
        </sup>
      );
    }
    return part;
  });
}
