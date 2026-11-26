import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** People who have opened the app, keyed by the Gateway's user id. */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    email: text("email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [index("users_org_email").on(t.orgId, t.email)],
);

/** A place of business's queue. `slug` is the public join link. */
export const queues = sqliteTable(
  "queues",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    address: text("address").notNull().default(""),
    hours: text("hours").notNull().default(""),
    timeZone: text("time_zone").notNull().default("UTC"),
    slug: text("slug").notNull(),
    paused: integer("paused", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    uniqueIndex("queues_slug").on(t.slug),
    index("queues_owner").on(t.ownerId),
  ],
);

/** Members the owner lets run the queue. */
export const queueManagers = sqliteTable(
  "queue_managers",
  {
    queueId: text("queue_id")
      .notNull()
      .references(() => queues.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.queueId, t.userId] }),
    index("queue_managers_user").on(t.userId),
  ],
);

export const TICKET_STATUSES = [
  "waiting",
  "called",
  "served",
  "no_show",
  "left",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** One person in a queue on one local day (`serviceDate`, YYYY-MM-DD). */
export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    queueId: text("queue_id")
      .notNull()
      .references(() => queues.id, { onDelete: "cascade" }),
    serviceDate: text("service_date").notNull(),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    token: text("token").notNull(),
    status: text("status", { enum: TICKET_STATUSES })
      .notNull()
      .default("waiting"),
    joinedAt: integer("joined_at").notNull(),
    calledAt: integer("called_at"),
  },
  (t) => [
    uniqueIndex("tickets_number").on(t.queueId, t.serviceDate, t.number),
    uniqueIndex("tickets_token").on(t.token),
    index("tickets_date").on(t.serviceDate),
  ],
);
