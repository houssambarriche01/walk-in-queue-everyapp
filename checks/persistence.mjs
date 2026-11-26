// Persistence: queues, co-managers and today's tickets survive a restart.
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { createQueue, join, getJson, emailOf } from "./lib.mjs";

const runtime = await startRuntime();
try {
  const owner = await (await runtime.context("owner")).newPage();
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/");
  const memberEmail = await emailOf(runtime, "member");
  const queue = await createQueue(owner, {
    name: "Riverside Tailor",
    hours: "Mon-Fri 10-18",
    timeZone: "Asia/Tokyo",
  });
  await owner.goto(`/queues/${queue.id}/settings`);
  await owner.getByTestId("manager-email").fill(memberEmail);
  await owner.getByTestId("add-manager").click();
  await expect(owner.getByTestId("manager-row")).toHaveCount(1);
  const ticket = await join(runtime, queue.slug, {
    name: "Kenji",
    phone: "+81 90 1234 5678",
  });
  expect(ticket.status).toBe(201);

  await runtime.restart();

  const info = await getJson(runtime, `/api/public/q/${queue.slug}`);
  expect(info.json).toMatchObject({
    name: "Riverside Tailor",
    hours: "Mon-Fri 10-18",
    waiting: 1,
  });
  const t = await getJson(
    runtime,
    `/api/public/q/${queue.slug}/t/${ticket.json.token}`,
  );
  expect(t.json.ticket).toMatchObject({ number: 1, status: "waiting" });
  const owner2 = await (await runtime.context("owner")).newPage();
  await owner2.goto(`/queues/${queue.id}`);
  await expect(
    owner2.getByTestId("section-waiting").getByTestId("ticket-1"),
  ).toContainText("Kenji");
  const member2 = await (await runtime.context("member")).newPage();
  await member2.goto("/");
  await expect(
    member2.getByTestId("queue-row").filter({ hasText: "Riverside Tailor" }),
  ).toBeVisible();
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
