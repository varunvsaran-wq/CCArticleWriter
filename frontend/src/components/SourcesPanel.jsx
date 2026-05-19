import { ExternalLink } from "lucide-react";
import { formatCitation } from "../utils/citations";

/**
 * Read-only sources panel rendered below the editor.
 * Citation markers in the editor body link here via #ref-N anchors.
 */
export default function SourcesPanel({ sources, citationStyle }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="border-t border-gray-200 mt-8 pt-6 px-6 sm:px-8 pb-8">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
        Sources
      </h2>
      <ol className="space-y-3">
        {sources.map((src, i) => (
          <li
            key={src.id ?? i}
            className="flex gap-3 text-sm"
            id={`ref-${i + 1}`}
          >
            <span className="text-indigo-500 font-mono font-semibold flex-shrink-0 w-6 text-right">
              [{i + 1}]
            </span>
            <div className="min-w-0 flex-1">
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-600 hover:text-indigo-800 underline break-words inline-flex items-center gap-1"
              >
                {src.title}
                <ExternalLink size={11} className="flex-shrink-0" />
              </a>
              <p className="text-gray-500 mt-0.5 text-xs leading-snug">
                {formatCitation(src, citationStyle)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
