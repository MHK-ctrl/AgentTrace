"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import type { Project, RealtimeEvent } from "@/lib/types";
import { Toaster, type ToastItem } from "@/components/ui";

export type RangePreset = "1h" | "24h" | "7d" | "30d";
export type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
type Theme = "dark" | "light";

const PRESET_LABELS: Record<RangePreset, string> = {
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const PRESET_MS: Record<RangePreset, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

interface WorkspaceValue {
  projects: Project[];
  projectsLoading: boolean;
  projectsError: string | null;
  projectId: string | null;
  project: Project | null;
  setProjectId: (id: string) => void;
  reloadProjects: () => Promise<void>;
  preset: RangePreset;
  setPreset: (preset: RangePreset) => void;
  presetLabel: string;
  range: { from: string; to: string };
  theme: Theme;
  toggleTheme: () => void;
  realtimeStatus: RealtimeStatus;
  eventCounter: number;
  lastEvent: RealtimeEvent | null;
  toast: (message: string, tone?: ToastItem["tone"]) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

function rangeFor(preset: RangePreset, now: number) {
  return {
    from: new Date(now - PRESET_MS[preset]).toISOString(),
    to: new Date(now).toISOString(),
  };
}

export function Providers({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [theme, setTheme] = useState<Theme>("dark");
  const [themeReady, setThemeReady] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("disconnected");
  const [eventCounter, setEventCounter] = useState(0);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const toastId = useRef(0);

  const toast = useCallback((message: string, tone: ToastItem["tone"] = "success") => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 5_000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const reloadProjects = useCallback(async () => {
    try {
      const data = await apiFetch<{ projects: Project[] }>("/v1/projects");
      setProjects(data.projects);
      setProjectsError(null);
      setProjectIdState((current) => {
        if (current && data.projects.some((project) => project.id === current)) return current;
        const stored =
          typeof window !== "undefined" ? localStorage.getItem("agenttrace.project") : null;
        const preferred =
          data.projects.find((project) => project.id === stored) ??
          data.projects.find((project) => project.isDemo) ??
          data.projects[0];
        return preferred?.id ?? null;
      });
    } catch (error) {
      setProjectsError(error instanceof Error ? error.message : "Unable to load projects");
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadProjects();
  }, [reloadProjects]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("agenttrace-theme");
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      /* ignore storage errors */
    } finally {
      setThemeReady(true);
    }
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem("agenttrace-theme", theme);
    } catch {
      /* ignore storage errors */
    }
  }, [theme, themeReady]);

  const setProjectId = useCallback((id: string) => {
    setProjectIdState(id);
    try {
      localStorage.setItem("agenttrace.project", id);
    } catch {
      /* ignore storage errors */
    }
    setEventCounter(0);
    setLastEvent(null);
  }, []);

  const project = useMemo(
    () => projects.find((item) => item.id === projectId) ?? null,
    [projects, projectId],
  );
  const range = useMemo(() => rangeFor(preset, now), [preset, now]);

  /* Project-scoped realtime connection with ticketed auth + backoff. */
  useEffect(() => {
    if (!projectId) {
      setRealtimeStatus("disconnected");
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let lastMessageAt = Date.now();

    const scheduleReconnect = () => {
      if (disposed) return;
      setRealtimeStatus("reconnecting");
      const delay = Math.min(1_000 * 2 ** retry, 15_000);
      retry += 1;
      reconnectTimer = setTimeout(() => void connect(), delay);
    };

    const connect = async () => {
      if (disposed) return;
      setRealtimeStatus(retry === 0 ? "connecting" : "reconnecting");
      try {
        const response = await fetch("/api/realtime-ticket", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId }),
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Ticket request failed (${response.status})`);
        const data = (await response.json()) as { ticket: string; wsUrl: string };
        if (disposed) return;

        socket = new WebSocket(data.wsUrl, ["agenttrace", data.ticket]);
        socket.onopen = () => {
          if (disposed) {
            socket?.close();
            return;
          }
          retry = 0;
          lastMessageAt = Date.now();
          setRealtimeStatus("connected");
        };
        socket.onmessage = (message) => {
          lastMessageAt = Date.now();
          try {
            const parsed = JSON.parse(String(message.data)) as {
              kind: string;
              event?: RealtimeEvent;
            };
            if (parsed.kind === "event" && parsed.event) {
              setLastEvent(parsed.event);
              setEventCounter((count) => count + 1);
            }
          } catch {
            /* ignore malformed frames */
          }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => {
          if (disposed) return;
          socket = null;
          scheduleReconnect();
        };
      } catch {
        scheduleReconnect();
      }
    };

    void connect();

    const watchdog = setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastMessageAt > 70_000) {
        socket.close();
        return;
      }
      socket.send("ping");
    }, 25_000);

    return () => {
      disposed = true;
      clearInterval(watchdog);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      setRealtimeStatus("disconnected");
    };
  }, [projectId]);

  const value: WorkspaceValue = {
    projects,
    projectsLoading,
    projectsError,
    projectId,
    project,
    setProjectId,
    reloadProjects,
    preset,
    setPreset,
    presetLabel: PRESET_LABELS[preset],
    range,
    theme,
    toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    realtimeStatus,
    eventCounter,
    lastEvent,
    toast,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside <Providers>");
  return context;
}
