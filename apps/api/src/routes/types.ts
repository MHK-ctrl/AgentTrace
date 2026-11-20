import type { ApiConfig } from "../config.js";
import type { Database } from "../database/client.js";
import type { TicketStore } from "../services/tickets.js";
import type { RealtimeHub } from "../websocket/hub.js";

export interface RouteDeps {
  db: Database;
  config: ApiConfig;
  hub: RealtimeHub;
  tickets: TicketStore;
}
