"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeEvent } from "@/lib/types";
import type { DemoSession } from "@/lib/demo-types";

type Theme = "dark" | "light";
type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

interface DemoContextValue {
  session: DemoSession;
  theme: Theme;
  toggleTheme: () => void;
  realtimeStatus: RealtimeStatus;
  eventCounter: number;
  lastEvent: RealtimeEvent | null;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({
  session,
  children,
}: {
  session: DemoSession;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [themeReady, setThemeReady] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [eventCounter, setEventCounter] = useState(0);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

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
    try {
      localStorage.setItem("agenttrace-theme", theme);
    } catch {
      /* ignore storage errors */
    }
  }, [theme, themeReady]);

  useEffect(() => {
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
        const response = await fetch("/api/demo/realtime-ticket", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
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
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({
      session,
      theme,
      toggleTheme,
      realtimeStatus,
      eventCounter,
      lastEvent,
    }),
    [session, theme, toggleTheme, realtimeStatus, eventCounter, lastEvent],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoWorkspace(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemoWorkspace must be used inside DemoProvider");
  return context;
}
