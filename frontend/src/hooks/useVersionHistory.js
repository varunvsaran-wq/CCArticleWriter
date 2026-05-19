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
    kind, // "snapshot" | "auto-before" | "auto-after" | "autosave"
  };
}

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
   * Save a direct manual edit. There is at most ONE autosave entry — it is
   * updated in place and floated to the end of the list. To preserve an
   * autosave snapshot, the user calls saveVersion() (or promoteAutosave).
   */
  const saveEdit = useCallback((article) => {
    let savedId = null;
    _setAndPersist((prev) => {
      const existing = prev.find((v) => v.kind === "autosave");
      const withoutAutosave = prev.filter((v) => v.kind !== "autosave");

      const entry = existing
        ? {
            ...existing,
            content: article.content,
            sources: article.sources,
            word_count: article.word_count,
            savedAt: new Date().toISOString(),
          }
        : makeVersion(article, "Autosave", null, true, "autosave");

      savedId = entry.id;
      return [...withoutAutosave, entry];
    });
    if (savedId) setCurrentId(savedId);
    return savedId;
  }, [_setAndPersist]);

  /**
   * Promote the current autosave into a named, permanent version.
   * Clears the autosave slot so a fresh one is created on the next edit.
   */
  const promoteAutosave = useCallback((name) => {
    let promotedId = null;
    _setAndPersist((prev) => {
      const autosave = prev.find((v) => v.kind === "autosave");
      if (!autosave) return prev;
      const promoted = {
        ...autosave,
        id: crypto.randomUUID(),
        name: name || `Saved at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        kind: "snapshot",
        auto: false,
      };
      promotedId = promoted.id;
      return [...prev.filter((v) => v.kind !== "autosave"), promoted];
    });
    if (promotedId) setCurrentId(promotedId);
    return promotedId;
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
    promoteAutosave,
    restoreVersion,
    renameVersion,
    deleteVersion,
  };
}
