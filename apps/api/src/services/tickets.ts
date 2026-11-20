import { randomBytes } from "node:crypto";

interface Ticket {
  projectId: string;
  expiresAt: number;
}

const TICKET_TTL_MS = 60_000;

/**
 * Browsers cannot set Authorization headers on WebSocket handshakes. Instead
 * the dashboard server (which holds the admin token) issues a 60-second,
 * single-use ticket bound to a project, and the browser passes it as a
 * WebSocket subprotocol.
 */
export class TicketStore {
  private readonly tickets = new Map<string, Ticket>();

  issue(projectId: string): { ticket: string; expiresAt: string } {
    this.prune();
    const ticket = randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + TICKET_TTL_MS;
    this.tickets.set(ticket, { projectId, expiresAt });
    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  consume(ticket: string, projectId: string): boolean {
    const entry = this.tickets.get(ticket);
    if (!entry) return false;
    this.tickets.delete(ticket);
    if (entry.expiresAt < Date.now()) return false;
    return entry.projectId === projectId;
  }

  private prune(): void {
    if (this.tickets.size < 500) return;
    const now = Date.now();
    for (const [ticket, entry] of this.tickets) {
      if (entry.expiresAt < now) this.tickets.delete(ticket);
    }
  }
}
