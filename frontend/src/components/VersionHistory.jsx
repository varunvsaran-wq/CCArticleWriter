import { useState } from "react";
import { Bookmark, ChevronDown, ChevronUp, Pencil, Trash2, Check, X, RotateCcw } from "lucide-react";

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function VersionItem({ version, isCurrent, onRestore, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(version.name);

  const commitRename = () => {
    if (draft.trim()) onRename(version.id, draft.trim());
    setEditing(false);
  };

  return (
    <div
      className={`group rounded-lg border px-3 py-2.5 transition-colors ${
        isCurrent
          ? "border-indigo-300 bg-indigo-50"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Current indicator */}
        <span
          className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
            isCurrent ? "bg-indigo-500" : "bg-gray-200"
          }`}
        />

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="flex-1 text-xs border border-indigo-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button onClick={commitRename} className="text-green-600 hover:text-green-800">
                <Check size={12} />
              </button>
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <p
                className={`text-xs font-medium truncate ${
                  isCurrent ? "text-indigo-800" : "text-gray-700"
                }`}
              >
                {version.name}
              </p>
              <button
                onClick={() => { setDraft(version.name); setEditing(true); }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <Pencil size={10} />
              </button>
            </div>
          )}

          <p className="text-[10px] text-gray-400 mt-0.5">
            {version.word_count.toLocaleString()} words · {timeAgo(version.savedAt)}
          </p>

          {version.instruction && (
            <p className="text-[10px] text-gray-400 italic mt-0.5 truncate" title={version.instruction}>
              "{version.instruction}"
            </p>
          )}
        </div>

        {/* Actions (shown on hover for non-current) */}
        <div className={`flex gap-1 flex-shrink-0 ${isCurrent ? "invisible" : "opacity-0 group-hover:opacity-100"}`}>
          <button
            onClick={() => onRestore(version.id)}
            title="Restore this version"
            className="text-indigo-500 hover:text-indigo-700"
          >
            <RotateCcw size={12} />
          </button>
          <button
            onClick={() => onDelete(version.id)}
            title="Delete"
            className="text-gray-300 hover:text-red-500"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VersionHistory({
  versions,
  currentId,
  onRestore,
  onSave,
  onRename,
  onDelete,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    const name = saveName.trim() || `Version ${versions.length + 1}`;
    onSave(name);
    setSaveName("");
    setSaving(false);
  };

  // Show newest first
  const sorted = [...versions].reverse();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer select-none border-b border-gray-100"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2">
          <Bookmark size={14} className="text-indigo-500" />
          <span className="text-xs font-semibold text-gray-700">Version History</span>
          <span className="text-[10px] bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5 font-medium">
            {versions.length}
          </span>
        </div>
        {collapsed ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronUp size={14} className="text-gray-400" />}
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* Save input */}
          {saving ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setSaving(false);
                }}
                placeholder={`Version ${versions.length + 1}`}
                className="flex-1 text-xs border border-indigo-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={handleSave}
                className="px-2.5 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700"
              >
                Save
              </button>
              <button
                onClick={() => setSaving(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSaving(true)}
              className="w-full flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-lg py-2 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              <Bookmark size={11} />
              Save current version
            </button>
          )}

          {/* Version list */}
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-0.5">
            {sorted.map((v) => (
              <VersionItem
                key={v.id}
                version={v}
                isCurrent={v.id === currentId}
                onRestore={onRestore}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
