import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

// An in-memory SQLite with the app's migrations stands in for D1.
const testDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return testDb.current;
  },
}));

const q = await import("./queues");
const { serviceDate } = await import("./time");

const ana = { id: "ana", email: "Ana@Example.com", orgId: "org" };
const bo = { id: "bo", email: "bo@example.com", orgId: "org" };
const cy = { id: "cy", email: "cy@example.com", orgId: "other" };
const details = { name: "Shop", address: "", hours: "", timeZone: "UTC" };

beforeAll(async () => {
  const db = drizzle(createClient({ url: ":memory:" }), { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
  testDb.current = db;
  for (const user of [ana, bo, cy]) await q.rememberMember(user);
});

describe("queues", () => {
  it("belong to their owner and co-managers", async () => {
    const { id } = await q.createQueue(ana, details);
    expect((await q.listQueues(bo)).map((x) => x.id)).not.toContain(id);
    await expect(q.board(bo, id)).rejects.toThrow("Queue not found");
    await expect(q.addManager(ana, id, "cy@example.com")).rejects.toThrow();
    await q.addManager(ana, id, "BO@example.com");
    expect((await q.listQueues(bo)).map((x) => x.id)).toContain(id);
    await q.callNext(bo, id);
    await expect(
      q.updateQueue(bo, { queueId: id, ...details, name: "Mine" }),
    ).rejects.toThrow("owner");
    await expect(q.deleteQueue(bo, id)).rejects.toThrow("owner");
    await expect(q.addManager(bo, id, "ana@example.com")).rejects.toThrow();
  });

  it("number tickets per day and call them in order", async () => {
    const { id } = await q.createQueue(ana, details);
    const { slug } = (await q.board(ana, id)).queue;
    const first = await q.joinQueue(slug, { name: "Ida" });
    const second = await q.joinQueue(slug, {
      name: "Max",
      phone: "+44 7700 900123",
    });
    expect([first.number, second.number]).toEqual([1, 2]);
    expect((await q.publicTicket(slug, second.token)).ticket.ahead).toBe(1);
    expect(await q.callNext(ana, id)).toEqual({ number: 1 });
    expect((await q.publicTicket(slug, second.token)).ticket.ahead).toBe(0);
    await expect(q.joinQueue(slug, { name: "" })).rejects.toThrow();
    await expect(q.joinQueue(slug, { name: "x".repeat(41) })).rejects.toThrow();
    await q.setPaused(ana, id, true);
    await expect(q.joinQueue(slug, { name: "Late" })).rejects.toThrow();
  });

  it("delete tickets from earlier days and restart numbering", async () => {
    const { id } = await q.createQueue(ana, {
      ...details,
      timeZone: "Pacific/Kiritimati",
    });
    const { slug } = (await q.board(ana, id)).queue;
    await q.joinQueue(slug, { name: "Early" });
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000);
    expect(serviceDate("Pacific/Kiritimati", tomorrow)).not.toBe(
      serviceDate("Pacific/Kiritimati"),
    );
    await q.deleteEarlierTickets(tomorrow);
    expect((await q.board(ana, id)).tickets).toEqual([]);
    expect((await q.joinQueue(slug, { name: "Next" })).number).toBe(1);
  });
});
