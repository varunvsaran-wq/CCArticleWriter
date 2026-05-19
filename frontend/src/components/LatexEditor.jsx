import { useEffect, useMemo, useState, useRef, useImperativeHandle, forwardRef } from "react";
import { Eye, FileCode2 } from "lucide-react";
import { renderLatexToHtml } from "../utils/latex";

/**
 * Split-pane LaTeX source editor with live KaTeX-powered preview.
 *
 * Edits are kept in component state and exposed via the ref (getLatex /
 * isDirty); they do NOT sync back into the article's markdown.
 */
const LatexEditor = forwardRef(function LatexEditor(
  { initialLatex, onSourceChange },
  ref
) {
  const [source, setSource] = useState(initialLatex || "");
  const initialRef = useRef(initialLatex || "");

  // If the parent passes new LaTeX (e.g. regenerated from markdown after the
  // user makes more edits), refresh the editor and reset the baseline.
  useEffect(() => {
    setSource(initialLatex || "");
    initialRef.current = initialLatex || "";
  }, [initialLatex]);

  const html = useMemo(() => renderLatexToHtml(source), [source]);

  useImperativeHandle(
    ref,
    () => ({
      getLatex: () => source,
      isDirty: () => source !== initialRef.current,
    }),
    [source]
  );

  const handleChange = (e) => {
    const next = e.target.value;
    setSource(next);
    onSourceChange?.(next);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 h-full">
      {/* Source pane */}
      <div className="flex flex-col border-b md:border-b-0 md:border-r border-gray-200 min-h-0">
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-2 flex-shrink-0">
          <FileCode2 size={12} className="text-gray-500" />
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            LaTeX source
          </span>
        </div>
        <textarea
          value={source}
          onChange={handleChange}
          spellCheck={false}
          className="flex-1 w-full px-4 py-3 font-mono text-xs leading-relaxed text-gray-800 bg-white border-none outline-none resize-none focus:bg-indigo-50/20"
        />
      </div>

      {/* Preview pane */}
      <div className="flex flex-col min-h-0">
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-2 flex-shrink-0">
          <Eye size={12} className="text-gray-500" />
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Preview
          </span>
        </div>
        <div
          className="flex-1 overflow-y-auto px-6 py-5 article-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
});

export default LatexEditor;
