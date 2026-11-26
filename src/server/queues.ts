import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { queueManagers, queues, tickets, users } from "@/db/schema";
import type { TicketStatus } from "@/db/schema";
import { isTimeZone, randomToken, serviceDate } from "./time";

/** What the queries need of the person the Gateway signed in. */
export interface Member {
  id: string;
  email: string;
  orgId: string;
}

/** A refusal the page or the public API shows as it is. */
export class QueueError extends Error {
  constructor(
    readonly code: "not_found" | "forbidden" | "invalid" | "conflict",
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- inputs

const text = (max: number) => z.string().trim().max(max);

export const queueDetailsInput = z
  .object({
    name: text(80).min(1, "Give the queue a name."),
    address: text(200).default(""),
    hours: text(200).default(""),
    timeZone: z
      .string()
      .trim()
      .default("UTC")
      .transform((zone) => zone || "UTC")
      .refine(isTimeZone, "Unknown time zone."),
  })
  .strict();
export type QueueDetails = z.infer<typeof queueDetailsInput>;

export const queueIdInput = z.object({ queueId: z.string().min(1) }).strict();
export const updateQueueInput = queueDetailsInput.extend({
  queueId: z.string().min(1),
});
export const pauseInput = queueIdInput.extend({ paused: z.boolean() });
export const managerInput = queueIdInput.extend({
  email: z.string().trim().min(1, "Enter an email.").max(254),
});
export const removeManagerInput = queueIdInput.extend({
  userId: z.string().min(1),
});
export const ticketActionInput = queueIdInput.extend({
  ticketId: z.string().min(1),
  action: z.enum(["call", "serve", "no_show", "requeue", "remove"]),
});

/** A first name and an optional phone number, as a customer types them. */
export const joinInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your first name.")
    .refine((v) => [...v].length <= 40, "Use at most 40 characters."),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .default("")
    .refine(
      (v) =>
        v === "" ||
        (/^\+?[\d\s().-]+$/.test(v) &&
          v.replace(/\D/g, "").length >= 6 &&
          v.replace(/\D/g, "").length <= 15),
      "Enter a phone number with its country code, or leave it empty.",
    ),
});
export const walkInInput = queueIdInput.extend({
  name: joinInput.shape.name,
  phone: joinInput.shape.phone,
});

// ---------------------------------------------------------------- members

/** Remember the member (first sight creates the row; the email follows the Gateway). */
export async function rememberMember(user: Member): Promise<void> {
  await db
    .insert(users)
    .values({ id: user.id, orgId: user.orgId, email: user.email.toLowerCase() })
    .onConflictDoUpdate({
      target: users.id,
      set: { orgId: user.orgId, email: user.email.toLowerCase() },
    });
}

type Role = "owner" | "manager";
type QueueRow = typeof queues.$inferSelect;

/** The queue and the member's role on it, or null when it isn't theirs to see. */
async function access(
  user: Member,
  queueId: string,
): Promise<{ queue: QueueRow; role: Role } | null> {
  const queue = await db
    .select()
    .from(queues)
    .where(and(eq(queues.id, queueId), eq(queues.orgId, user.orgId)))
    .get();
  if (!queue) return null;
  if (queue.ownerId === user.id) return { queue, role: "owner" };
  const manager = await db
    .select({ userId: queueManagers.userId })
    .from(queueManagers)
    .where(
      and(
        eq(queueManagers.queueId, queueId),
        eq(queueManagers.userId, user.id),
      ),
    )
    .get();
  return manager ? { queue, role: "manager" } : null;
}

async function requireAccess(user: Member, queueId: string, role?: "owner") {
  const found = await access(user, queueId);
  if (!found) throw new QueueError("not_found", "Queue not found.");
  if (role === "owner" && found.role !== "owner") {
    throw new QueueError("forbidden", "Only the queue's owner can do this.");
  }
  return found;
}

// ---------------------------------------------------------------- queues

export async function listQueues(user: Member) {
  const managed = db
    .select({ id: queueManagers.queueId })
    .from(queueManagers)
    .where(eq(queueManagers.userId, user.id));
  const rows = await db
    .select()
    .from(queues)
    .where(
      and(
        eq(queues.orgId, user.orgId),
        or(eq(queues.ownerId, user.id), inArray(queues.id, managed)),
      ),
    )
    .orderBy(asc(queues.name));
  return Promise.all(
    rows.map(async (q) => ({
      id: q.id,
      name: q.name,
      address: q.address,
      paused: q.paused,
      role: (q.ownerId === user.id ? "owner" : "manager") as Role,
      waiting: await countWaiting(q.id, serviceDate(q.timeZone)),
    })),
  );
}

export async function createQueue(user: Member, input: QueueDetails) {
  const id = crypto.randomUUID();
  await db.insert(queues).values({
    id,
    orgId: user.orgId,
    ownerId: user.id,
    ...input,
    slug: randomToken(10),
  });
  return { id };
}

export async function updateQueue(
  user: Member,
  { queueId, ...details }: z.infer<typeof updateQueueInput>,
) {
  await requireAccess(user, queueId, "owner");
  await db.update(queues).set(details).where(eq(queues.id, queueId));
  return { ok: true };
}

export async function deleteQueue(user: Member, queueId: string) {
  await requireAccess(user, queueId, "owner");
  await db.batch([
    db.delete(tickets).where(eq(tickets.queueId, queueId)),
    db.delete(queueManagers).where(eq(queueManagers.queueId, queueId)),
    db.delete(queues).where(eq(queues.id, queueId)),
  ]);
  return { ok: true };
}

export async function setPaused(
  user: Member,
  queueId: string,
  paused: boolean,
) {
  await requireAccess(user, queueId);
  await db.update(queues).set({ paused }).where(eq(queues.id, queueId));
  return { paused };
}

/** The settings page: details for everyone who manages it, co-managers for the owner. */
export async function queueSettings(user: Member, queueId: string) {
  const { queue, role } = await requireAccess(user, queueId);
  const managers =
    role === "owner"
      ? await db
          .select({ userId: users.id, email: users.email })
          .from(queueManagers)
          .innerJoin(users, eq(users.id, queueManagers.userId))
          .where(eq(queueManagers.queueId, queueId))
          .orderBy(asc(users.email))
      : [];
  return {
    id: queue.id,
    name: queue.name,
    address: queue.address,
    hours: queue.hours,
    timeZone: queue.timeZone,
    role,
    managers,
  };
}

export async function addManager(user: Member, queueId: string, email: string) {
  const { queue } = await requireAccess(user, queueId, "owner");
  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.orgId, queue.orgId), eq(users.email, email.toLowerCase())),
    )
    .get();
  if (!found) {
    throw new QueueError(
      "invalid",
      "No one with that email has opened this app yet. Ask them to open it once, then add them.",
    );
  }
  if (found.id === queue.ownerId) {
    throw new QueueError("invalid", "That's the queue's owner.");
  }
  await db
    .insert(queueManagers)
    .values({ queueId, userId: found.id })
    .onConflictDoNothing();
  return { ok: true };
}

export async function removeManager(
  user: Member,
  queueId: string,
  userId: string,
) {
  await requireAccess(user, queueId, "owner");
  await db
    .delete(queueManagers)
    .where(
      and(eq(queueManagers.queueId, queueId), eq(queueManagers.userId, userId)),
    );
  return { ok: true };
}

// ---------------------------------------------------------------- board

export async function board(user: Member, queueId: string) {
  const { queue, role } = await requireAccess(user, queueId);
  const today = serviceDate(queue.timeZone);
  const rows = await db
    .select({
      id: tickets.id,
      number: tickets.number,
      name: tickets.name,
      phone: tickets.phone,
      status: tickets.status,
      joinedAt: tickets.joinedAt,
    })
    .from(tickets)
    .where(and(eq(tickets.queueId, queueId), eq(tickets.serviceDate, today)))
    .orderBy(asc(tickets.number));
  return {
    queue: {
      id: queue.id,
      name: queue.name,
      address: queue.address,
      slug: queue.slug,
      paused: queue.paused,
      timeZone: queue.timeZone,
    },
    role,
    today,
    tickets: rows,
  };
}

export async function callNext(user: Member, queueId: string) {
  const { queue } = await requireAccess(user, queueId);
  const today = serviceDate(queue.timeZone);
  const [called] = await db.all<{ number: number }>(sql`
    update tickets set status = 'called', called_at = ${Date.now()}
    where id = (
      select id from tickets
      where queue_id = ${queueId} and service_date = ${today} and status = 'waiting'
      order by number limit 1
    )
    returning number`);
  return { number: called?.number ?? null };
}

const TRANSITIONS: Record<
  "call" | "serve" | "no_show" | "requeue",
  { from: TicketStatus[]; to: TicketStatus }
> = {
  call: { from: ["waiting"], to: "called" },
  serve: { from: ["called"], to: "served" },
  no_show: { from: ["called"], to: "no_show" },
  requeue: { from: ["called", "no_show"], to: "waiting" },
};

export async function ticketAction(
  user: Member,
  { queueId, ticketId, action }: z.infer<typeof ticketActionInput>,
) {
  const { queue } = await requireAccess(user, queueId);
  const mine = and(
    eq(tickets.id, ticketId),
    eq(tickets.queueId, queueId),
    eq(tickets.serviceDate, serviceDate(queue.timeZone)),
  );
  if (action === "remove") {
    await db.delete(tickets).where(mine);
    return { ok: true };
  }
  const { from, to } = TRANSITIONS[action];
  const changed = await db
    .update(tickets)
    .set({
      status: to,
      ...(to === "called" ? { calledAt: Date.now() } : {}),
    })
    .where(and(mine, inArray(tickets.status, from)))
    .returning({ id: tickets.id });
  if (changed.length === 0) {
    throw new QueueError("conflict", "That ticket has changed. Try again.");
  }
  return { ok: true };
}

export async function addWalkIn(
  user: Member,
  { queueId, name, phone }: z.infer<typeof walkInInput>,
) {
  const { queue } = await requireAccess(user, queueId);
  return insertTicket(queue, name, phone);
}

// ---------------------------------------------------------------- public

async function queueBySlug(slug: string) {
  return db.select().from(queues).where(eq(queues.slug, slug)).get();
}

async function countWaiting(queueId: string, today: string): Promise<number> {
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(tickets)
    .where(
      and(
        eq(tickets.queueId, queueId),
        eq(tickets.serviceDate, today),
        eq(tickets.status, "waiting"),
      ),
    )
    .get();
  return Number(row?.n ?? 0);
}

function publicView(queue: QueueRow, waiting: number) {
  return {
    name: queue.name,
    address: queue.address,
    hours: queue.hours,
    paused: queue.paused,
    waiting,
  };
}

/** What anyone with the link sees: the business and how many are waiting. */
export async function publicQueue(slug: string) {
  const queue = await queueBySlug(slug);
  if (!queue) throw new QueueError("not_found", "Queue not found.");
  return publicView(
    queue,
    await countWaiting(queue.id, serviceDate(queue.timeZone)),
  );
}

async function insertTicket(queue: QueueRow, name: string, phone: string) {
  const today = serviceDate(queue.timeZone);
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = crypto.randomUUID();
    const token = randomToken(32);
    try {
      const [row] = await db.all<{ number: number }>(sql`
        insert into tickets (id, queue_id, service_date, number, name, phone, token, status, joined_at)
        select ${id}, ${queue.id}, ${today}, coalesce(max(number), 0) + 1,
               ${name}, ${phone}, ${token}, 'waiting', ${Date.now()}
        from tickets where queue_id = ${queue.id} and service_date = ${today}
        returning number`);
      if (row) return { number: row.number, token };
    } catch (error) {
      if (!String(error).includes("UNIQUE") || attempt === 4) throw error;
    }
  }
  throw new QueueError("conflict", "Couldn't take a number. Try again.");
}

export async function joinQueue(slug: string, input: unknown) {
  const queue = await queueBySlug(slug);
  if (!queue) throw new QueueError("not_found", "Queue not found.");
  const parsed = joinInput.safeParse(input);
  if (!parsed.success) {
    throw new QueueError("invalid", parsed.error.issues[0].message);
  }
  if (queue.paused) {
    throw new QueueError(
      "conflict",
      "This queue isn't taking new people right now.",
    );
  }
  return insertTicket(queue, parsed.data.name, parsed.data.phone);
}

async function ticketFor(slug: string, token: string) {
  const queue = await queueBySlug(slug);
  if (!queue) return null;
  const ticket = await db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.token, token),
        eq(tickets.queueId, queue.id),
        eq(tickets.serviceDate, serviceDate(queue.timeZone)),
      ),
    )
    .get();
  return ticket ? { queue, ticket } : null;
}

/** A customer's own ticket: never anyone else's name or number. */
export async function publicTicket(slug: string, token: string) {
  const found = await ticketFor(slug, token);
  if (!found) throw new QueueError("not_found", "Ticket not found.");
  const { queue, ticket } = found;
  const today = ticket.serviceDate;
  const ahead =
    ticket.status === "waiting"
      ? Number(
          (
            await db
              .select({ n: sql<number>`count(*)` })
              .from(tickets)
              .where(
                and(
                  eq(tickets.queueId, queue.id),
                  eq(tickets.serviceDate, today),
                  eq(tickets.status, "waiting"),
                  sql`${tickets.number} < ${ticket.number}`,
                ),
              )
              .get()
          )?.n ?? 0,
        )
      : 0;
  return {
    queue: publicView(queue, await countWaiting(queue.id, today)),
    ticket: {
      number: ticket.number,
      name: ticket.name,
      status: ticket.status,
      ahead,
    },
  };
}

export async function leaveQueue(slug: string, token: string) {
  const found = await ticketFor(slug, token);
  if (!found) throw new QueueError("not_found", "Ticket not found.");
  const changed = await db
    .update(tickets)
    .set({ status: "left" })
    .where(and(eq(tickets.id, found.ticket.id), eq(tickets.status, "waiting")))
    .returning({ id: tickets.id });
  if (changed.length === 0) {
    throw new QueueError(
      "conflict",
      "Only a waiting ticket can leave the queue.",
    );
  }
  return { ok: true };
}

// ---------------------------------------------------------------- cleanup

/** Delete every ticket from before today in its queue's time zone. */
export async function deleteEarlierTickets(at: Date = new Date()) {
  const zones = await db
    .selectDistinct({ timeZone: queues.timeZone })
    .from(queues);
  for (const { timeZone } of zones) {
    await db.run(sql`
      delete from tickets
      where service_date < ${serviceDate(timeZone, at)}
        and queue_id in (select id from queues where time_zone = ${timeZone})`);
  }
  // Tickets whose queue is gone.
  await db.run(
    sql`delete from tickets where queue_id not in (select id from queues)`,
  );
}
