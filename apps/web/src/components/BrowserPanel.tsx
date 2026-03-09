import { useCallback, useEffect, useRef, useState } from "react";
import { GlobeIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const BROWSER_URL_STORAGE_PREFIX = "t3code:browser-url";

function storageKeyForProject(projectId: string | undefined): string {
  return projectId ? `${BROWSER_URL_STORAGE_PREFIX}:${projectId}` : BROWSER_URL_STORAGE_PREFIX;
}

function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function readBrowserUrl(projectId: string | undefined): string {
  try {
    const url = localStorage.getItem(storageKeyForProject(projectId)) ?? "";
    return url.length > 0 && isLocalhostUrl(url) ? url : "";
  } catch {
    return "";
  }
}

export function saveBrowserUrl(projectId: string | undefined, url: string): void {
  try {
    localStorage.setItem(storageKeyForProject(projectId), url);
  } catch {
    // Ignore storage write failures (private mode, quota exceeded, etc.)
  }
}

interface BrowserPanelProps {
  projectId?: string | undefined;
}

export default function BrowserPanel({ projectId }: BrowserPanelProps) {
  const [inputUrl, setInputUrl] = useState(() => readBrowserUrl(projectId));
  const [loadedUrl, setLoadedUrl] = useState(() => readBrowserUrl(projectId));
  const [refreshKey, setRefreshKey] = useState(0);
  const [serverReachable, setServerReachable] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // When projectId changes, load that project's saved URL
  useEffect(() => {
    const url = readBrowserUrl(projectId);
    setInputUrl(url);
    setLoadedUrl(url);
    setRefreshKey((k) => k + 1);
  }, [projectId]);

  // Health-check: detect when the dev server goes down and when it comes back.
  // Uses no-cors fetch to localhost — a network error means the server is unreachable.
  // Polls every 10s while reachable (crash detection) and every 2s while down
  // (fast recovery detection).
  useEffect(() => {
    if (loadedUrl.length === 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const checkHealth = async () => {
      let isReachable = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 2000);
        await fetch(loadedUrl, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: controller.signal });
        isReachable = true;
        if (!cancelled) setServerReachable(true);
      } catch {
        if (!cancelled) setServerReachable(false);
      } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
      }
      if (!cancelled) {
        timer = setTimeout(checkHealth, isReachable ? 10_000 : 2_000);
      }
    };

    // First check after a brief delay (give the iframe a moment to attempt load)
    timer = setTimeout(checkHealth, 1500);

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [loadedUrl]);

  // Reset reachable state when the URL changes (new URL deserves a fresh attempt)
  const prevLoadedUrlRef = useRef(loadedUrl);
  useEffect(() => {
    if (prevLoadedUrlRef.current !== loadedUrl) {
      prevLoadedUrlRef.current = loadedUrl;
      setServerReachable(true);
    }
  }, [loadedUrl]);

  const navigateTo = useCallback(
    (url: string) => {
      const trimmed = url.trim();
      const normalized = trimmed.startsWith("http") ? trimmed : `http://${trimmed}`;
      if (!isLocalhostUrl(normalized)) {
        setInputUrl(loadedUrl);
        return;
      }
      setLoadedUrl(normalized);
      setInputUrl(normalized);
      saveBrowserUrl(projectId, normalized);
      setRefreshKey((k) => k + 1);
    },
    [projectId, loadedUrl],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(inputUrl);
  };

  const handleRefresh = () => {
    setServerReachable(true);
    setRefreshKey((k) => k + 1);
  };

  const hasUrl = loadedUrl.length > 0;

  return (
    <div className="flex h-full flex-col bg-card text-foreground">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
        <form className="min-w-0 flex-1" onSubmit={handleSubmit}>
          <Input
            ref={inputRef}
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            className="h-7 text-xs"
            spellCheck={false}
            placeholder="http://localhost:3000"
            aria-label="Browser URL"
          />
        </form>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="shrink-0 text-muted-foreground/70 hover:text-foreground"
          onClick={handleRefresh}
          disabled={!hasUrl}
          aria-label="Refresh page"
        >
          <RefreshCwIcon className="size-3.5" />
        </Button>
      </div>
      {/* Content */}
      <div className="min-h-0 flex-1 bg-[#1e1e1e]">
        {hasUrl && serverReachable ? (
          // eslint-disable-next-line react/iframe-missing-sandbox -- allow-same-origin enables Vite HMR WebSocket for localhost dev preview
          <iframe
            key={refreshKey}
            src={loadedUrl}
            className="h-full w-full border-none"
            title="Browser preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-pointer-lock"
          />
        ) : hasUrl ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="space-y-2 text-neutral-500">
              <GlobeIcon className="mx-auto size-8 opacity-30" />
              <p className="text-sm">Dev server not responding</p>
              <p className="text-xs opacity-70">
                Reconnecting to {loadedUrl}...
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="space-y-2 text-neutral-500">
              <GlobeIcon className="mx-auto size-8 opacity-30" />
              <p className="text-sm">No dev server running</p>
              <p className="text-xs opacity-70">
                Start a dev server script or type a URL above
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
