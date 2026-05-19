import { useState, useEffect } from "react";
import { BookOpen, RotateCcw, AlertCircle, PlayCircle } from "lucide-react";
import BriefForm from "./components/BriefForm";
import PipelineProgress from "./components/PipelineProgress";
import ArticleEditor from "./components/ArticleEditor";
import VersionHistory from "./components/VersionHistory";
import ExportButtons from "./components/ExportButtons";
import { useArticleJob } from "./hooks/useArticleJob";
import { useVersionHistory } from "./hooks/useVersionHistory";

export default function App() {
  const { status, events, article: generatedArticle, jobId, error, submit, reset, runDemo } = useArticleJob();
  const [citationStyle, setCitationStyle] = useState("inline");

  // Working article — may be a restored version different from generated
  const [workingArticle, setWorkingArticle] = useState(null);

  const {
    versions,
    currentId,
    currentVersion,
    initialize,
    saveVersion,
    autoSave,
    addRevision,
    saveEdit,
    promoteAutosave,
    restoreVersion,
    renameVersion,
    deleteVersion,
  } = useVersionHistory();

  // When generation finishes, initialise working article and version history
  useEffect(() => {
    if (generatedArticle && !workingArticle) {
      setWorkingArticle(generatedArticle);
      setCitationStyle(generatedArticle.citation_style ?? "inline");
      initialize(generatedArticle);
    }
  }, [generatedArticle, workingArticle, initialize]);

  // When user restores a version, update the working article
  const handleRestore = (id) => {
    restoreVersion(id);
    const v = versions.find((v) => v.id === id);
    if (v) {
      setWorkingArticle({
        ...workingArticle,
        content: v.content,
        sources: v.sources,
        word_count: v.word_count,
      });
    }
  };

  const handleRevisionComplete = (revisedArticle, instruction) => {
    // Auto-save the current state before applying the revision
    if (workingArticle) autoSave(workingArticle, instruction);
    setWorkingArticle(revisedArticle);
    addRevision(revisedArticle, instruction);
  };

  const handleContentEdit = (editedArticle) => {
    // Debounced auto-save from the rich-text editor.
    // useVersionHistory.saveEdit collapses rapid edits into one version.
    setWorkingArticle(editedArticle);
    saveEdit(editedArticle);
  };

  const handleSaveVersion = (name) => {
    // If there's a pending autosave, promote it into a named version
    // (avoids duplicating identical content). Otherwise snapshot the working article.
    const hasAutosave = versions.some((v) => v.kind === "autosave");
    if (hasAutosave) {
      promoteAutosave(name);
    } else if (workingArticle) {
      saveVersion(workingArticle, name);
    }
  };

  const handleReset = () => {
    setWorkingArticle(null);
    reset();
    // version history resets automatically because workingArticle → null
    // and initialize() will be called again when the next article arrives
  };

  const isIdle    = status === "idle";
  const isRunning = status === "loading" || status === "streaming";
  const isDone    = status === "done" && !!workingArticle;
  const isError   = status === "error";

  // Display article is the current version's content merged into workingArticle shape
  const displayArticle = currentVersion
    ? { ...workingArticle, content: currentVersion.content, sources: currentVersion.sources, word_count: currentVersion.word_count }
    : workingArticle;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 text-white rounded-lg p-1.5">
              <BookOpen size={18} />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-none">Article Writer</h1>
              <p className="text-xs text-gray-500 leading-none mt-0.5">Multi-agent research pipeline</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isDone && (
              <ExportButtons
                article={displayArticle}
                citationStyle={citationStyle}
                onCitationStyleChange={setCitationStyle}
              />
            )}
            {!isIdle && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
              >
                <RotateCcw size={12} />
                New article
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-8">

        {/* ── IDLE ── */}
        {isIdle && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Research & write any article
              </h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                Describe your topic and a team of AI agents will research the web,
                synthesize sources, and write a fully cited, editable article.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <BriefForm onSubmit={submit} isLoading={false} />
            </div>
            <div className="text-center mt-5">
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

        {/* ── RUNNING ── */}
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

        {/* ── ERROR ── */}
        {isError && (
          <div className="max-w-xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex gap-3">
              <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800 text-sm">Pipeline error</p>
                <p className="text-red-600 text-sm mt-1">{error}</p>
                <button onClick={handleReset} className="mt-3 text-xs text-red-700 underline hover:text-red-900">
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DONE — Editor layout ── */}
        {isDone && displayArticle && (
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 h-[calc(100vh-8rem)]">

            {/* Left column: version history */}
            <div className="flex flex-col gap-4 overflow-y-auto">
              <VersionHistory
                versions={versions}
                currentId={currentId}
                onRestore={handleRestore}
                onSave={handleSaveVersion}
                onRename={renameVersion}
                onDelete={deleteVersion}
              />

              {/* Article meta */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Article</p>
                <p className="text-sm font-semibold text-gray-800 leading-snug">{displayArticle.title}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {displayArticle.word_count?.toLocaleString()} words
                  </span>
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize">
                    {displayArticle.content_type}
                  </span>
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {displayArticle.sources?.length} sources
                  </span>
                </div>
              </div>
            </div>

            {/* Right column: article editor */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <ArticleEditor
                article={displayArticle}
                citationStyle={citationStyle}
                jobId={jobId}
                onRevisionComplete={handleRevisionComplete}
                onContentEdit={handleContentEdit}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">
        Article Writer · Multi-agent pipeline powered by Claude
      </footer>
    </div>
  );
}
