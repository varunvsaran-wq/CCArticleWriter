import { useState, useCallback } from "react";

function makeVersion(article, name, instruction = null, auto = false, kind = "snapshot") {
  return {
    id: crypto.randomUUID(),
    name,
    content: article.content,
    sources: article.sources,
    word_count: article.word_count,
    savedAt: new Date().toISOString(),
    instruction,
    auto,
    kind, // "snapshot" | "auto-before" | "auto-after" | "manual-edit"
  };
}

const MANUAL_EDIT_WINDOW_MS = 2 * 60 * 1000; // collapse rapid edits into one version

function storageKey(articleId) {
  return `article-versions-${articleId}`;
}

function loadFromStorage(articleId) {
  try {
    const raw = localStorage.getItem(storageKey(articleId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function persist(articleId, versions) {
  try {
    localStorage.setItem(storageKey(articleId), JSON.stringify(versions));
  } catch {}
}

export function useVersionHistory() {
  const [articleId, setArticleId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [currentId, setCurrentId] = useState(null);

  // Call once when the first article arrives
  const initialize = useCallback((article) => {
    const id = article.id;
    setArticleId(id);

    const stored = loadFromStorage(id);
    if (stored && stored.length > 0) {
      setVersions(stored);
      setCurrentId(stored[stored.length - 1].id);
      return;
    }

    const initial = makeVersion(article, "Original");
    setVersions([initial]);
    setCurrentId(initial.id);
    persist(id, [initial]);
  }, []);

  const _setAndPersist = useCallback((updater) => {
    setVersions((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (articleId) persist(articleId, next);
      return next;
    });
  }, [articleId]);

  const currentVersion = versions.find((v) => v.id === currentId) ?? versions[versions.length - 1] ?? null;

  const saveVersion = useCallback((article, name) => {
    const v = makeVersion(article, name);
    _setAndPersist((prev) => [...prev, v]);
    setCurrentId(v.id);
    return v.id;
  }, [_setAndPersist]);

  const autoSave = useCallback((article, instruction) => {
    const label = `Before: ${instruction.slice(0, 40)}${instruction.length > 40 ? "…" : ""}`;
    const v = makeVersion(article, label, instruction, true);
    _setAndPersist((prev) => [...prev, v]);
    setCurrentId(v.id);
    return v.id;
  }, [_setAndPersist]);

  const addRevision = useCallback((article, instruction) => {
    const label = `After: ${instruction.slice(0, 40)}${instruction.length > 40 ? "…" : ""}`;
    const v = makeVersion(article, label, instruction, false, "auto-after");
    _setAndPersist((prev) => [...prev, v]);
    setCurrentId(v.id);
    return v.id;
  }, [_setAndPersist]);

  /**
   * Save a direct manual edit. Collapses rapid edits: if the latest version
   * is a manual edit younger than MANUAL_EDIT_WINDOW_MS, update it in place
   * instead of appending a new version.
   */
  const saveEdit = useCallback((article) => {
    let appendedId = null;
    _setAndPersist((prev) => {
      const last = prev[prev.length - 1];
      const lastIsRecentEdit =
        last &&
        last.kind === "manual-edit" &&
        Date.now() - new Date(last.savedAt).getTime() < MANUAL_EDIT_WINDOW_MS;

      if (lastIsRecentEdit) {
        const updated = {
          ...last,
          content: article.content,
          sources: article.sources,
          word_count: article.word_count,
          savedAt: new Date().toISOString(),
        };
        appendedId = updated.id;
        return [...prev.slice(0, -1), updated];
      }

      const timeLabel = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const v = makeVersion(article, `Edit at ${timeLabel}`, null, true, "manual-edit");
      appendedId = v.id;
      return [...prev, v];
    });
    if (appendedId) setCurrentId(appendedId);
    return appendedId;
  }, [_setAndPersist]);

  const restoreVersion = useCallback((id) => {
    setCurrentId(id);
  }, []);

  const renameVersion = useCallback((id, name) => {
    _setAndPersist((prev) => prev.map((v) => (v.id === id ? { ...v, name } : v)));
  }, [_setAndPersist]);

  const deleteVersion = useCallback((id) => {
    _setAndPersist((prev) => {
      const next = prev.filter((v) => v.id !== id);
      setCurrentId((cur) => {
        if (cur !== id) return cur;
        return next.length > 0 ? next[next.length - 1].id : null;
      });
      return next;
    });
  }, [_setAndPersist]);

  return {
    versions,
    currentId,
    currentVersion,
    initialize,
    saveVersion,
    autoSave,
    addRevision,
    saveEdit,
    restoreVersion,
    renameVersion,
    deleteVersion,
  };
}
