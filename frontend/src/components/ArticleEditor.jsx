import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Send, Loader2, AlertCircle, ChevronDown } from "lucide-react";
import RichTextEditor from "./RichTextEditor";
import SourcesPanel from "./SourcesPanel";
import {
  splitBodyAndRefs,
  extractSections,
  countWords,
} from "../utils/markdown";
import { rewriteReferences } from "../utils/citations";

const PLACEHOLDERS = [
  "Make the introduction more engaging…",
  "Add a section about regulatory challenges…",
  "Shorten this section by half…",
  "Change the tone to be more conversational…",
  "Add more data and statistics…",
  "Strengthen the conclusion…",
];

const AUTO_SAVE_MS = 3000;

function reassemble(body, sources, citationStyle) {
  return rewriteReferences(body, sources, citationStyle);
}

export default function ArticleEditor({
  article,
  citationStyle,
  jobId,
  onRevisionComplete,
  onContentEdit,
}) {
  const editorRef = useRef(null);
  const debounceRef = useRef(null);
  const textareaRef = useRef(null);

  const [instruction, setInstruction] = useState("");
  const [sectionScope, setSectionScope] = useState("");
  const [isRevising, setIsRevising] = useState(false);
  const [revisionError, setRevisionError] = useState(null);
  const [autosaveState, setAutosaveState] = useState("idle"); // idle | pending | saved
  const [placeholder] = useState(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]
  );

  // The body the editor edits; references are regenerated from sources on save
  const { body, sections } = useMemo(() => {
    const { body } = splitBodyAndRefs(article.content);
    return { body, sections: extractSections(body) };
  }, [article.content]);

  // Reset scope if the article structure changes and the scoped section is gone
  useEffect(() => {
    if (sectionScope && !sections.includes(sectionScope)) {
      setSectionScope("");
    }
  }, [sections, sectionScope]);

  // Auto-resize the revision textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [instruction]);

  // Debounced auto-save when the editor body changes
  const handleMarkdownChange = useCallback(
    (newBody) => {
      if (newBody.trim() === body.trim()) return;

      setAutosaveState("pending");
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        const newContent = reassemble(newBody, article.sources, citationStyle);
        onContentEdit?.({
          ...article,
          content: newContent,
          word_count: countWords(newContent),
        });
        setAutosaveState("saved");
        setTimeout(() => setAutosaveState("idle"), 1500);
      }, AUTO_SAVE_MS);
    },
    [body, article, citationStyle, onContentEdit]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const flushPendingEdit = () => {
    if (!debounceRef.current) return null;
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
    const currentBody = editorRef.current?.getMarkdown() ?? body;
    const newContent = reassemble(currentBody, article.sources, citationStyle);
    onContentEdit?.({
      ...article,
      content: newContent,
      word_count: countWords(newContent),
    });
    setAutosaveState("saved");
    setTimeout(() => setAutosaveState("idle"), 1500);
    return newContent;
  };

  const handleRevise = async () => {
    const trimmed = instruction.trim();
    if (!trimmed || isRevising) return;

    // Make sure we send the freshest content (flush pending auto-save)
    const flushed = flushPendingEdit();
    const currentBody = editorRef.current?.getMarkdown() ?? body;
    const currentContent =
      flushed ?? reassemble(currentBody, article.sources, citationStyle);

    setIsRevising(true);
    setRevisionError(null);

    try {
      const res = await fetch("/api/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: trimmed,
          content: currentContent,
          sources: article.sources,
          topic: article.title,
          job_id: jobId || null,
          section_scope: sectionScope || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      const scopeLabel = sectionScope ? `[${sectionScope}] ` : "";
      onRevisionComplete(
        {
          ...article,
          content: data.content,
          sources: data.sources,
          word_count: data.word_count,
        },
        scopeLabel + trimmed
      );
      setInstruction("");
    } catch (err) {
      setRevisionError(err.message);
    } finally {
      setIsRevising(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleRevise();
    }
  };

  // Citation markers in the editor scroll to ref-N in the SourcesPanel below
  useEffect(() => {
    const handler = (e) => {
      const marker = e.target.closest("[data-ref]");
      if (!marker) return;
      const n = marker.getAttribute("data-ref");
      const el = document.getElementById(`ref-${n}`);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Scroll area: toolbar (sticky) + editor + sources */}
      <div className="flex-1 overflow-y-auto relative">
        {isRevising && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3">
            <Loader2 size={28} className="text-indigo-500 animate-spin" />
            <p className="text-sm text-gray-600 font-medium">
              Revising {sectionScope ? `"${sectionScope}"` : "article"}…
            </p>
            <p className="text-xs text-gray-400 max-w-xs text-center">
              "{instruction.slice(0, 80)}{instruction.length > 80 ? "…" : ""}"
            </p>
          </div>
        )}

        <RichTextEditor
          ref={editorRef}
          initialMarkdown={body}
          onMarkdownChange={handleMarkdownChange}
        />

        <SourcesPanel sources={article.sources} citationStyle={citationStyle} />
      </div>

      {/* Revision bar — sticky bottom */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex-shrink-0">
        {revisionError && (
          <div className="flex items-center gap-2 text-xs text-red-600 mb-2 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle size={12} />
            {revisionError}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Section scope dropdown */}
          {sections.length > 0 && (
            <div className="relative flex-shrink-0">
              <select
                value={sectionScope}
                onChange={(e) => setSectionScope(e.target.value)}
                disabled={isRevising}
                className="appearance-none bg-white border border-gray-300 rounded-lg pl-2.5 pr-7 py-2.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[140px] truncate"
                title="Scope of the revision"
              >
                <option value="">Whole article</option>
                {sections.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={isRevising}
            className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white disabled:opacity-50 disabled:cursor-not-allowed min-h-[42px]"
          />
          <button
            onClick={handleRevise}
            disabled={!instruction.trim() || isRevising}
            title="Send (⌘↵)"
            className="flex items-center justify-center w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex-shrink-0"
          >
            {isRevising ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>

        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[10px] text-gray-400">
            {sectionScope
              ? `Revising only "${sectionScope}"`
              : "Revising the whole article"} · <kbd className="font-sans">⌘</kbd>+<kbd className="font-sans">↵</kbd> to send
          </p>
          <p className="text-[10px] text-gray-400 h-3">
            {autosaveState === "pending" && "Saving edit…"}
            {autosaveState === "saved" && "Edit saved"}
          </p>
        </div>
      </div>
    </div>
  );
}
