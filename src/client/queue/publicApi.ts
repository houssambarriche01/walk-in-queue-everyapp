/** The public JSON the join and ticket pages read (src/routes/api/public). */
export interface PublicQueue {
  name: string;
  address: string;
  hours: string;
  paused: boolean;
  waiting: number;
}

export type TicketStatus = "waiting" | "called" | "served" | "no_show" | "left";

export interface PublicTicket {
  queue: PublicQueue;
  ticket: { number: number; name: string; status: TicketStatus; ahead: number };
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

export async function call<T>(
  path: string,
  init?: RequestInit,
): Promise<Result<T>> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) return { ok: true, data: body as T };
    return {
      ok: false,
      status: res.status,
      error: body.error ?? "Something went wrong. Try again.",
    };
  } catch {
    return { ok: false, status: 0, error: "No connection. Try again." };
  }
}

/** Where the browser keeps the customer's ticket for a queue. */
export const ticketKey = (slug: string) => `walk-in-queue:ticket:${slug}`;

export function storedTicket(slug: string): string | null {
  try {
    return localStorage.getItem(ticketKey(slug));
  } catch {
    return null;
  }
}

export function storeTicket(slug: string, token: string | null) {
  try {
    if (token) localStorage.setItem(ticketKey(slug), token);
    else localStorage.removeItem(ticketKey(slug));
  } catch {
    // Private mode: the ticket page's own link still works.
  }
}
