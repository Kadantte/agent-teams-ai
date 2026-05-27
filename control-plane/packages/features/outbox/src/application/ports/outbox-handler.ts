import type { ClaimedOutboxEvent } from "./outbox.repository.js";

export type OutboxHandlerResult =
  | Readonly<{ kind: "completed" }>
  | Readonly<{
      kind: "retry";
      error: unknown;
      retryAfterMs?: number;
      consumeAttempt?: boolean;
    }>
  | Readonly<{ kind: "dead-letter"; error: unknown }>;

export interface OutboxEventHandler {
  handle(event: ClaimedOutboxEvent): Promise<OutboxHandlerResult>;
}

export interface OutboxHandlerRegistry {
  getHandler(input: {
    eventType: string;
    eventVersion: number;
  }): OutboxEventHandler | undefined;
}
