export type RealtimeEvent =
  | {
      type: "trace.started";
      traceId: string;
      name: string;
      agentName: string | null;
      startedAt: string;
      isDemo: boolean;
    }
  | {
      type: "trace.completed";
      traceId: string;
      status: string;
      durationMs: number | null;
      completedAt: string;
    }
  | {
      type: "span.started";
      traceId: string;
      spanId: string;
      name: string;
      operationType: string;
      startedAt: string;
    }
  | {
      type: "span.completed";
      traceId: string;
      spanId: string;
      name: string;
      status: string;
      durationMs: number | null;
    }
  | {
      type: "span.event";
      traceId: string;
      spanId: string;
      name: string;
    };

interface SocketLike {
  readyState: number;
  send: (data: string) => void;
}

interface Subscription {
  projectId: string;
}

/**
 * In-memory fan-out. Each socket is bound to exactly one project at connect
 * time; publishes are never broadcast across projects.
 */
export class RealtimeHub {
  private readonly sockets = new Map<SocketLike, Subscription>();

  add(socket: SocketLike, projectId: string): void {
    this.sockets.set(socket, { projectId });
  }

  remove(socket: SocketLike): void {
    this.sockets.delete(socket);
  }

  publish(projectId: string, event: RealtimeEvent): void {
    const payload = JSON.stringify({ kind: "event", event, sentAt: new Date().toISOString() });
    for (const [socket, subscription] of this.sockets) {
      if (subscription.projectId !== projectId) continue;
      if (socket.readyState !== 1) continue;
      try {
        socket.send(payload);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  count(projectId?: string): number {
    if (!projectId) return this.sockets.size;
    let count = 0;
    for (const subscription of this.sockets.values()) {
      if (subscription.projectId === projectId) count += 1;
    }
    return count;
  }

  closeAll(): void {
    this.sockets.clear();
  }
}
