import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * Fetches `path` and keeps the previous data while refetching (no flash on reload).
 * Pass path = null to skip.
 */
export function useApi(path, { interval } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return undefined;
    const ctrl = new AbortController();
    setLoading(true);
    api(path, { signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [path, tick]);

  useEffect(() => {
    if (!interval || !path) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), interval);
    return () => clearInterval(id);
  }, [interval, path]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** Runs an async action with a loading flag. */
export function useAction(fn) {
  const [busy, setBusy] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async (...args) => {
    setBusy(true);
    try {
      return await fnRef.current(...args);
    } finally {
      setBusy(false);
    }
  }, []);
  return [run, busy];
}

export function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Per-browser convenience storage (drafts, UI prefs). Never required for correctness. */
export const localPref = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  removePrefix(prefix) {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(prefix)) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  },
};

/** Counts seconds while the tab is visible. */
export function useStopwatch(running = true) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);
  return [seconds, setSeconds];
}
