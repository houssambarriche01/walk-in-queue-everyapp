import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { callTool, listTools } from "@every-app/sdk/testing";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

// The tools called the way the Gateway calls them for an AI client: each
// with an identity minted for the one call, through the SDK's tools
// endpoint, which checks the caller's scopes and the input. The same
// in-memory SQLite as queues.test.ts stands in for D1.
const testDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return testDb.current;
  },
}));

const { tools } = await import("./tools");

beforeAll(async () => {
  const db = drizzle(createClient({ url: ":memory:" }), { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  testDb.current = db;
});

describe("tools", () => {
  it("lists each tool with its risk", async () => {
    const { tools: listed } = await listTools(tools);
    expect(listed.map(({ name, risk }) => [name, risk])).toEqual([
      ["call_next", "write"],
      ["get_board", "read"],
      ["list_queues", "read"],
    ]);
  });

  it("acts for the person calling, and only on their queues", async () => {
    const { createQueue } = await import("@/server/queues");
    const { id } = await createQueue(
      { id: "ana", email: "ana@example.com", orgId: "org" },
      { name: "Ana's shop", address: "", hours: "", timeZone: "UTC" },
    );
    const bo = await callTool(tools, "list_queues", {}, { user: { id: "bo" } });
    expect(bo).toMatchObject({ result: { content: [{ text: "[]" }] } });
    const refused = await callTool(
      tools,
      "call_next",
      { queueId: id },
      { user: { id: "bo" } },
    );
    expect(JSON.stringify(refused)).toContain("Queue not found");
  });

  it("refuses a caller whose connection may only read", async () => {
    const response = await callTool(
      tools,
      "call_next",
      { queueId: "x" },
      { scopes: ["mcp:read"] },
    );
    expect(response).toMatchObject({ error: { code: "forbidden" } });
  });
});
