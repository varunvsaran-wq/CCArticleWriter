import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Send, Loader2, AlertCircle, ChevronDown, Highlighter } from "lucide-react";
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
  // scope kinds: "whole" | "section" | "selection". Derived from sectionScope + selection.
  const [selection, setSelection] = useState(null); // { from, to, text } | null
  const [useSelection, setUseSelection] = useState(false); // user explicitly chose selection scope
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

  // If the user clears their selection, drop selection scope
  useEffect(() => {
    if (!selection) setUseSelection(false);
  }, [selection]);

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

    // Flush pending auto-save and grab freshest content
    const flushed = flushPendingEdit();
    const currentBody = editorRef.current?.getMarkdown() ?? body;
    const currentContent =
      flushed ?? reassemble(currentBody, article.sources, citationStyle);

    // Build payload based on active scope
    const isSelectionMode = useSelection && selection && selection.text.trim();
    let payload;
    if (isSelectionMode) {
      const { before, after } = editorRef.current?.getContextAround(
        selection.from,
        selection.to,
        500
      ) ?? { before: "", after: "" };
      payload = {
        instruction: trimmed,
        content: currentContent,
        sources: article.sources,
        topic: article.title,
        job_id: jobId || null,
        selection: selection.text,
        context_before: before,
        context_after: after,
      };
    } else {
      payload = {
        instruction: trimmed,
        content: currentContent,
        sources: article.sources,
        topic: article.title,
        job_id: jobId || null,
        section_scope: sectionScope || null,
      };
    }

    setIsRevising(true);
    setRevisionError(null);

    try {
      const res = await fetch("/api/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();

      if (data.mode === "selection") {
        // Splice the revised snippet back in place. TipTap's onUpdate will fire,
        // which feeds the new body into our debounced auto-save naturally.
        editorRef.current?.replaceRange(selection.from, selection.to, data.selection_text);
        onRevisionComplete?.(
          { ...article }, // article state updates via auto-save; just signal "revision happened"
          `[selection] ${trimmed}`
        );
        setUseSelection(false);
        setSelection(null);
      } else {
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
      }

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
          onSelectionChange={setSelection}
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

        {/* Selection indicator banner — appears whenever the user has text highlighted */}
        {selection && (
          <div
            className={`flex items-center gap-2 text-xs mb-2 rounded-lg px-3 py-2 border ${
              useSelection
                ? "bg-indigo-50 border-indigo-200 text-indigo-800"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
          >
            <Highlighter size={12} className="flex-shrink-0" />
            <span className="flex-1 truncate">
              {useSelection ? "Editing selected text: " : "Selected: "}
              <span className="italic opacity-80">
                "{selection.text.slice(0, 80)}{selection.text.length > 80 ? "…" : ""}"
              </span>
              <span className="opacity-60 ml-1">({selection.text.length} chars)</span>
            </span>
            <button
              onClick={() => setUseSelection((v) => !v)}
              className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors ${
                useSelection
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-white border border-amber-300 text-amber-700 hover:bg-amber-100"
              }`}
            >
              {useSelection ? "Editing selection" : "Edit selection only"}
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Section scope dropdown — disabled in selection mode */}
          {sections.length > 0 && (
            <div className="relative flex-shrink-0">
              <select
                value={sectionScope}
                onChange={(e) => setSectionScope(e.target.value)}
                disabled={isRevising || useSelection}
                className="appearance-none bg-white border border-gray-300 rounded-lg pl-2.5 pr-7 py-2.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[140px] truncate disabled:opacity-50 disabled:cursor-not-allowed"
                title={useSelection ? "Disabled while editing a selection" : "Scope of the revision"}
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
            {useSelection && selection
              ? `Revising selected text (${selection.text.length} chars)`
              : sectionScope
              ? `Revising only "${sectionScope}"`
              : "Revising the whole article"}{" "}
            · <kbd className="font-sans">⌘</kbd>+<kbd className="font-sans">↵</kbd> to send
          </p>
          <p className="text-[10px] text-gray-400 h-3">
            {autosaveState === "pending" && "Autosaving…"}
            {autosaveState === "saved" && "Autosaved"}
          </p>
        </div>
      </div>
    </div>
  );
}
