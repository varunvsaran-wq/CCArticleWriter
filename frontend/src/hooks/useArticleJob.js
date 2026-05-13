import { useState, useCallback, useRef } from "react";
import { streamMockEvents } from "../utils/mockData";

/**
 * Manages submitting a brief, streaming SSE pipeline events,
 * and holding the final article result.
 */
export function useArticleJob() {
  const [status, setStatus] = useState("idle"); // idle | loading | streaming | done | error
  const [events, setEvents] = useState([]);
  const [article, setArticle] = useState(null);
  const [error, setError] = useState(null);
  const esRef = useRef(null);
  const mockAbortRef = useRef(false);

  const reset = useCallback(() => {
    mockAbortRef.current = true;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setStatus("idle");
    setEvents([]);
    setArticle(null);
    setError(null);
  }, []);

  const runDemo = useCallback(async () => {
    reset();
    mockAbortRef.current = false;
    setStatus("streaming");

    for await (const event of streamMockEvents()) {
      if (mockAbortRef.current) break;
      setEvents((prev) => [...prev, event]);
      if (event.type === "article_ready") {
        setArticle(event.data.article);
        setStatus("done");
      } else if (event.type === "error") {
        setError(event.message);
        setStatus("error");
      }
    }
  }, [reset]);

  const submit = useCallback(async (brief) => {
    reset();
    setStatus("loading");

    try {
      const res = await fetch("/api/article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const { job_id } = await res.json();

      setStatus("streaming");

      const es = new EventSource(`/api/article/${job_id}/stream`);
      esRef.current = es;

      es.onmessage = (e) => {
        const event = JSON.parse(e.data);
        setEvents((prev) => [...prev, event]);

        if (event.type === "article_ready") {
          setArticle(event.data.article);
          setStatus("done");
          es.close();
          esRef.current = null;
        } else if (event.type === "error") {
          setError(event.message);
          setStatus("error");
          es.close();
          esRef.current = null;
        }
      };

      es.onerror = () => {
        if (status !== "done") {
          setError("Connection lost. The pipeline may still be running — refresh to retry.");
          setStatus("error");
        }
        es.close();
        esRef.current = null;
      };
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }, [reset]);

  return { status, events, article, error, submit, reset, runDemo };
}
