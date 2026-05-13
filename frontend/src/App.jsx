import { useState } from "react";
import { BookOpen, RotateCcw, AlertCircle, PlayCircle } from "lucide-react";
import BriefForm from "./components/BriefForm";
import PipelineProgress from "./components/PipelineProgress";
import ArticleViewer from "./components/ArticleViewer";
import ExportButtons from "./components/ExportButtons";
import { useArticleJob } from "./hooks/useArticleJob";

export default function App() {
  const { status, events, article, error, submit, reset, runDemo } = useArticleJob();
  const [citationStyle, setCitationStyle] = useState("inline");

  // When article arrives, default citation style to what was requested
  const handleArticleReady = (art) => {
    setCitationStyle(art.citation_style ?? "inline");
  };

  // Sync citation style when article is first loaded
  if (article && citationStyle === "inline" && article.citation_style !== "inline") {
    setCitationStyle(article.citation_style);
  }

  const isIdle = status === "idle";
  const isRunning = status === "loading" || status === "streaming";
  const isDone = status === "done";
  const isError = status === "error";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 text-white rounded-lg p-1.5">
              <BookOpen size={18} />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-none">Article Writer</h1>
              <p className="text-xs text-gray-500 leading-none mt-0.5">Multi-agent research pipeline</p>
            </div>
          </div>

          {!isIdle && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              <RotateCcw size={12} />
              New article
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* IDLE — show brief form centered */}
        {isIdle && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Research & write any article
              </h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                Describe your topic and a team of AI agents will research the web,
                synthesize sources, and write a fully cited article — the same iterative
                approach as Claude Code, applied to writing.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <BriefForm onSubmit={submit} isLoading={false} />
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-400 mb-2">No API key? Preview the full UI with sample data.</p>
              <button
                onClick={runDemo}
                className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <PlayCircle size={15} />
                Run demo walkthrough
              </button>
            </div>
          </div>
        )}

        {/* RUNNING — two-column: progress left, placeholder right */}
        {isRunning && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-5">Pipeline Progress</h2>
              <PipelineProgress events={events} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col items-center justify-center min-h-64 text-center">
              <div className="space-y-3 text-gray-400">
                <div className="flex justify-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-2 h-2 rounded-full bg-indigo-300 animate-pulse-dot"
                      style={{ animationDelay: `${i * 0.3}s` }}
                    />
                  ))}
                </div>
                <p className="text-sm">Agents are researching and writing…</p>
                <p className="text-xs text-gray-300">Your article will appear here when ready</p>
              </div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {isError && (
          <div className="max-w-xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex gap-3">
              <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800 text-sm">Pipeline error</p>
                <p className="text-red-600 text-sm mt-1">{error}</p>
                <button
                  onClick={reset}
                  className="mt-3 text-xs text-red-700 underline hover:text-red-900"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DONE — progress summary + full article */}
        {isDone && article && (
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 leading-tight">{article.title}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Generation complete</p>
              </div>
              <ExportButtons
                article={article}
                citationStyle={citationStyle}
                onCitationStyleChange={setCitationStyle}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sidebar: pipeline summary */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                    Pipeline Summary
                  </h3>
                  <PipelineProgress events={events} />
                </div>
              </div>

              {/* Main: article */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
                <ArticleViewer article={article} citationStyle={citationStyle} />
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-8">
        Article Writer · Multi-agent pipeline powered by Claude
      </footer>
    </div>
  );
}
