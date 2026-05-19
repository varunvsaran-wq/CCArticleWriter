import { useState, useRef, useEffect } from "react";
import { Send, Loader2, AlertCircle } from "lucide-react";
import ArticleViewer from "./ArticleViewer";

const PLACEHOLDERS = [
  "Make the introduction more engaging…",
  "Add a section about regulatory challenges…",
  "Shorten the third section by half…",
  "Change the tone to be more conversational…",
  "Add more data and statistics…",
  "Strengthen the conclusion…",
];

export default function ArticleEditor({
  article,
  citationStyle,
  onRevisionComplete,
}) {
  const [instruction, setInstruction] = useState("");
  const [isRevising, setIsRevising] = useState(false);
  const [revisionError, setRevisionError] = useState(null);
  const [placeholder] = useState(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]
  );
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [instruction]);

  const handleRevise = async () => {
    const trimmed = instruction.trim();
    if (!trimmed || isRevising) return;

    setIsRevising(true);
    setRevisionError(null);

    try {
      const res = await fetch("/api/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: trimmed,
          content: article.content,
          sources: article.sources,
          topic: article.title,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      onRevisionComplete(
        {
          ...article,
          content: data.content,
          sources: data.sources,
          word_count: data.word_count,
        },
        trimmed
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

  return (
    <div className="flex flex-col h-full">
      {/* Article content — scrollable */}
      <div className="flex-1 overflow-y-auto relative">
        {/* Revising overlay */}
        {isRevising && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
            <Loader2 size={28} className="text-indigo-500 animate-spin" />
            <p className="text-sm text-gray-600 font-medium">Revising article…</p>
            <p className="text-xs text-gray-400 max-w-xs text-center">
              "{instruction.slice(0, 80)}{instruction.length > 80 ? "…" : ""}"
            </p>
          </div>
        )}

        <div className="p-6 sm:p-8">
          <ArticleViewer article={article} citationStyle={citationStyle} />
        </div>
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
            {isRevising ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>

        <p className="text-[10px] text-gray-400 mt-1.5">
          Describe a change to make · <kbd className="font-sans">⌘</kbd>+<kbd className="font-sans">↵</kbd> to send
        </p>
      </div>
    </div>
  );
}
