// Behavior: every frozen feature's main path (F001-F004).
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { createQueue, join, getJson, emailOf } from "./lib.mjs";

const runtime = await startRuntime();
try {
  const owner = await (await runtime.context("owner")).newPage();
  const memberPage = await (await runtime.context("member")).newPage();
  const visitor = await (await runtime.context(null)).newPage();
  const memberEmail = await emailOf(runtime, "member");

  // F001: the member opens the app; the owner creates a queue.
  await memberPage.goto("/");
  await expect(memberPage.getByTestId("new-queue")).toBeVisible();
  await owner.goto("/");
  await runtime.assertBackLink(owner);
  const queue = await createQueue(owner, {
    name: "Harbour Street Barbers",
    address: "12 Harbour Street, Porto",
    hours: "Tue-Sat 9:00-19:00",
    timeZone: "Europe/Lisbon",
  });
  expect(new URL(queue.joinUrl).hostname).toBe(runtime.hostname);
  expect(new URL(queue.joinUrl).pathname).toBe(`/q/${queue.slug}`);
  expect(queue.slug.length).toBeGreaterThanOrEqual(8);
  await expect(owner.getByTestId("qr-code")).toBeVisible();
  await expect(
    owner.getByRole("button", { name: /copy/i }).first(),
  ).toBeVisible();
  await owner.goto("/");
  await expect(
    owner
      .getByTestId("queue-row")
      .filter({ hasText: "Harbour Street Barbers" }),
  ).toBeVisible();

  // A queue's time zone defaults to UTC.
  const plain = await createQueue(owner, { name: "Pop-up Repair Desk" });
  const plainRow = await (await runtime.database())
    .prepare("select time_zone from queues where id = ?")
    .bind(plain.id)
    .first();
  expect(plainRow.time_zone).toBe("UTC");

  // F002: the public join page and request-level checks.
  let info = await getJson(runtime, `/api/public/q/${queue.slug}`);
  expect(info.status).toBe(200);
  expect(info.json).toMatchObject({
    name: "Harbour Street Barbers",
    address: "12 Harbour Street, Porto",
    hours: "Tue-Sat 9:00-19:00",
    paused: false,
    waiting: 0,
  });
  expect((await getJson(runtime, "/api/public/q/does-not-exist")).status).toBe(
    404,
  );
  expect((await join(runtime, queue.slug, { name: "" })).status).toBe(400);
  expect((await join(runtime, queue.slug, { name: "   " })).status).toBe(400);
  expect(
    (await join(runtime, queue.slug, { name: "x".repeat(41) })).status,
  ).toBe(400);
  const amira = await join(runtime, queue.slug, {
    name: "Amira",
    phone: "+351 912 345 678",
  });
  expect(amira.status).toBe(201);
  expect(amira.json.number).toBe(1);
  expect(amira.json.token.length).toBeGreaterThanOrEqual(20);
  const tomas = await join(runtime, queue.slug, { name: "Tomás" });
  expect(tomas.json.number).toBe(2);
  const amiraTicket = await getJson(
    runtime,
    `/api/public/q/${queue.slug}/t/${amira.json.token}`,
  );
  expect(amiraTicket.json.ticket).toMatchObject({
    number: 1,
    status: "waiting",
    ahead: 0,
  });

  await visitor.goto(`/q/${queue.slug}`);
  await expect(visitor.getByTestId("queue-title")).toHaveText(
    "Harbour Street Barbers",
  );
  await expect(visitor.getByTestId("queue-address")).toContainText(
    "12 Harbour Street, Porto",
  );
  await expect(visitor.getByTestId("queue-hours")).toContainText(
    "Tue-Sat 9:00-19:00",
  );
  await expect(visitor.getByTestId("waiting-count")).toHaveText("2");
  await visitor.getByTestId("join-name").fill("Lena");
  await Promise.all([
    visitor.waitForURL(new RegExp(`/q/${queue.slug}/t/[^/]+$`)),
    visitor.getByTestId("join-submit").click(),
  ]);
  const lenaUrl = visitor.url();
  await expect(visitor.getByTestId("ticket-number")).toHaveText("3");
  await expect(visitor.getByTestId("ticket-status")).toHaveText("Waiting");
  await expect(visitor.getByTestId("ticket-ahead")).toContainText("2");
  const ticketText = await visitor.locator("body").innerText();
  expect(ticketText).not.toContain("Amira");
  expect(ticketText).not.toContain("912");
  // The browser remembers the ticket.
  await Promise.all([
    visitor.waitForURL(lenaUrl),
    visitor.goto(`/q/${queue.slug}`),
  ]);
  await expect(visitor.getByTestId("ticket-number")).toHaveText("3");

  // F003: the board.
  await owner.goto(`/queues/${queue.id}`);
  await expect(owner.getByTestId("count-waiting")).toHaveText("3");
  await expect(owner.getByTestId("count-served")).toHaveText("0");
  const waiting = owner.getByTestId("section-waiting");
  await expect(waiting.getByTestId("ticket-1")).toContainText("Amira");
  await expect(waiting.getByTestId("ticket-1")).toContainText(
    "+351 912 345 678",
  );
  await expect(waiting.getByTestId("ticket-2")).toContainText("Tomás");
  await expect(waiting.getByTestId("ticket-3")).toContainText("Lena");
  const wa = await owner.getByTestId("whatsapp-1").getAttribute("href");
  expect(wa).toMatch(/^https:\/\/wa\.me\/351912345678\?text=/);
  expect(decodeURIComponent(wa.split("text=")[1])).toContain(
    "Harbour Street Barbers",
  );
  await expect(owner.getByTestId("whatsapp-2")).toHaveCount(0);

  await owner.getByTestId("call-next").click();
  await expect(
    owner.getByTestId("section-called").getByTestId("ticket-1"),
  ).toBeVisible();
  // The open ticket page updates without a reload.
  await expect(visitor.getByTestId("ticket-ahead")).toContainText("1", {
    timeout: 15_000,
  });
  await owner
    .getByTestId("ticket-3")
    .getByRole("button", { name: "Call", exact: true })
    .click();
  await expect(
    owner.getByTestId("section-called").getByTestId("ticket-3"),
  ).toBeVisible();
  await expect(visitor.getByTestId("ticket-status")).toHaveText("Called", {
    timeout: 15_000,
  });
  await owner
    .getByTestId("ticket-3")
    .getByRole("button", { name: "Back to waiting" })
    .click();
  await expect(
    owner.getByTestId("section-waiting").getByTestId("ticket-3"),
  ).toBeVisible();
  await expect(visitor.getByTestId("ticket-status")).toHaveText("Waiting", {
    timeout: 15_000,
  });
  await owner
    .getByTestId("ticket-1")
    .getByRole("button", { name: "Served" })
    .click();
  await expect(
    owner.getByTestId("section-done").getByTestId("ticket-1"),
  ).toContainText("Served");
  await expect(owner.getByTestId("count-served")).toHaveText("1");
  await owner
    .getByTestId("ticket-2")
    .getByRole("button", { name: "Call", exact: true })
    .click();
  await owner
    .getByTestId("ticket-2")
    .getByRole("button", { name: "No-show" })
    .click();
  await expect(
    owner.getByTestId("section-done").getByTestId("ticket-2"),
  ).toContainText("No-show");
  await owner
    .getByTestId("ticket-2")
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(owner.getByTestId("ticket-2")).toHaveCount(0);
  await owner.getByTestId("walkin-name").fill("Jonas");
  await owner.getByTestId("walkin-phone").fill("+351 913 000 111");
  await owner.getByTestId("walkin-submit").click();
  await expect(
    owner.getByTestId("section-waiting").getByTestId("ticket-4"),
  ).toContainText("Jonas");
  await expect(owner.getByTestId("count-waiting")).toHaveText("2");

  // A waiting customer leaves; a ticket that isn't waiting can't.
  const pedro = await join(runtime, queue.slug, { name: "Pedro" });
  expect(pedro.json.number).toBe(5);
  const leave = await runtime.fetch(
    `/api/public/q/${queue.slug}/t/${pedro.json.token}/leave`,
    { method: "POST" },
  );
  expect(leave.status).toBe(200);
  expect(
    (
      await getJson(
        runtime,
        `/api/public/q/${queue.slug}/t/${pedro.json.token}`,
      )
    ).json.ticket.status,
  ).toBe("left");
  const amiraLeave = await runtime.fetch(
    `/api/public/q/${queue.slug}/t/${amira.json.token}/leave`,
    { method: "POST" },
  );
  expect(amiraLeave.status).toBe(409);
  await expect(
    owner.getByTestId("section-done").getByTestId("ticket-5"),
  ).toContainText("Left", { timeout: 15_000 });
  // Leaving from the ticket page.
  await visitor.getByTestId("leave-queue").click();
  await visitor.getByTestId("confirm-leave").click();
  await expect(visitor.getByTestId("ticket-status")).toHaveText("Left");

  // F001: pause and resume joining.
  await owner.getByTestId("pause-toggle").click();
  await expect(owner.getByTestId("pause-toggle")).toHaveText(/resume/i);
  info = await getJson(runtime, `/api/public/q/${queue.slug}`);
  expect(info.json.paused).toBe(true);
  expect((await join(runtime, queue.slug, { name: "Nadia" })).status).toBe(409);
  const fresh = await (await runtime.context(null)).newPage();
  await fresh.goto(`/q/${queue.slug}`);
  await expect(fresh.getByTestId("queue-closed")).toBeVisible();
  await expect(fresh.getByTestId("join-submit")).toHaveCount(0);
  await owner.getByTestId("pause-toggle").click();
  await expect(owner.getByTestId("pause-toggle")).toHaveText(/pause/i);
  expect((await join(runtime, queue.slug, { name: "Nadia" })).status).toBe(201);

  // F001: co-managers.
  await owner.goto(`/queues/${queue.id}/settings`);
  await owner.getByTestId("manager-email").fill("nobody-here@example.com");
  await owner.getByTestId("add-manager").click();
  await expect(owner.getByTestId("manager-error")).toBeVisible();
  await owner.getByTestId("manager-email").fill(memberEmail);
  await owner.getByTestId("add-manager").click();
  await expect(
    owner.getByTestId("manager-row").filter({ hasText: memberEmail }),
  ).toBeVisible();
  await memberPage.goto("/");
  await expect(
    memberPage
      .getByTestId("queue-row")
      .filter({ hasText: "Harbour Street Barbers" }),
  ).toBeVisible();
  await memberPage
    .getByTestId("queue-row")
    .filter({ hasText: "Harbour Street Barbers" })
    .click();
  await expect(memberPage.getByTestId("count-waiting")).toHaveText("2");
  await memberPage.getByTestId("call-next").click();
  await expect(
    memberPage.getByTestId("section-called").getByTestId("ticket-3"),
  ).toHaveCount(0);
  await expect(
    memberPage.getByTestId("section-called").getByTestId("ticket-4"),
  ).toContainText("Jonas");
  // The board updates live for the owner too.
  await owner.goto(`/queues/${queue.id}`);
  await expect(
    owner.getByTestId("section-called").getByTestId("ticket-4"),
  ).toBeVisible();
  await memberPage
    .getByTestId("ticket-4")
    .getByRole("button", { name: "Served" })
    .click();
  await expect(
    owner.getByTestId("section-done").getByTestId("ticket-4"),
  ).toBeVisible({ timeout: 15_000 });
  // Only the owner edits details or co-managers.
  await memberPage.goto(`/queues/${queue.id}/settings`);
  await expect(memberPage.getByTestId("owner-only")).toBeVisible();
  await expect(memberPage.getByTestId("save-details")).toHaveCount(0);
  await expect(memberPage.getByTestId("delete-queue")).toHaveCount(0);

  // The owner edits details.
  await owner.goto(`/queues/${queue.id}/settings`);
  await owner.getByTestId("queue-hours").fill("Tue-Sun 9:00-20:00");
  await owner.getByTestId("save-details").click();
  await expect(owner.getByTestId("details-saved")).toBeVisible();
  expect(
    (await getJson(runtime, `/api/public/q/${queue.slug}`)).json.hours,
  ).toBe("Tue-Sun 9:00-20:00");
  // ...and removes the co-manager.
  await owner
    .getByTestId("manager-row")
    .filter({ hasText: memberEmail })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(owner.getByTestId("manager-row")).toHaveCount(0);
  await memberPage.goto("/");
  await expect(
    memberPage
      .getByTestId("queue-row")
      .filter({ hasText: "Harbour Street Barbers" }),
  ).toHaveCount(0);

  // The owner deletes a queue.
  await owner.goto(`/queues/${plain.id}/settings`);
  await owner.getByTestId("delete-queue").click();
  await Promise.all([
    owner.waitForURL(/\/$/),
    owner.getByTestId("confirm-delete").click(),
  ]);
  await expect(
    owner.getByTestId("queue-row").filter({ hasText: "Pop-up Repair Desk" }),
  ).toHaveCount(0);
  expect((await getJson(runtime, `/api/public/q/${plain.slug}`)).status).toBe(
    404,
  );

  // F004: tickets from an earlier day disappear and numbering restarts.
  const db = await runtime.database();
  await db
    .prepare(
      "update tickets set service_date = '2000-01-01' where queue_id = ?",
    )
    .bind(queue.id)
    .run();
  expect(
    (await getJson(runtime, `/api/public/q/${queue.slug}`)).json.waiting,
  ).toBe(0);
  expect(
    (
      await getJson(
        runtime,
        `/api/public/q/${queue.slug}/t/${amira.json.token}`,
      )
    ).status,
  ).toBe(404);
  await owner.goto(`/queues/${queue.id}`);
  await expect(owner.getByTestId("count-waiting")).toHaveText("0");
  await expect(owner.getByTestId("ticket-1")).toHaveCount(0);
  const nextDay = await join(runtime, queue.slug, {
    name: "Amira",
    phone: "+351 912 345 678",
  });
  expect(nextDay.json.number).toBe(1);
  await runtime.scheduled("*/30 * * * *");
  const old = await db
    .prepare(
      "select count(*) as n from tickets where service_date = '2000-01-01'",
    )
    .first();
  expect(old.n).toBe(0);
  const kept = await db
    .prepare("select count(*) as n from tickets where queue_id = ?")
    .bind(queue.id)
    .first();
  expect(kept.n).toBe(1);
  expect(
    (await getJson(runtime, `/api/public/q/${queue.slug}`)).json.name,
  ).toBe("Harbour Street Barbers");

  // Phone-sized smoke on the public join page.
  const phone = await (
    await runtime.context(null, {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
  ).newPage();
  await phone.goto(`/q/${queue.slug}`);
  await expect(phone.getByTestId("queue-title")).toBeVisible();
  await expect(phone.getByTestId("join-submit")).toBeVisible();
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  // The picture: a busy morning on the board.
  for (const [name, phoneNo] of [
    ["Tomás", ""],
    ["Lena", "+351 936 222 410"],
    ["Rui", ""],
    ["Beatriz", "+351 917 555 090"],
  ]) {
    expect(
      (
        await join(
          runtime,
          queue.slug,
          phoneNo ? { name, phone: phoneNo } : { name },
        )
      ).status,
    ).toBe(201);
  }
  await owner.goto(`/queues/${queue.id}`);
  await owner.getByTestId("call-next").click();
  await expect(
    owner.getByTestId("section-called").getByTestId("ticket-1"),
  ).toBeVisible();
  await owner
    .getByTestId("ticket-1")
    .getByRole("button", { name: "Served" })
    .click();
  await owner.getByTestId("call-next").click();
  await expect(
    owner.getByTestId("section-called").getByTestId("ticket-2"),
  ).toBeVisible();
  await expect(owner.getByTestId("count-waiting")).toHaveText("3");
  await expect(owner.getByTestId("call-next")).toBeEnabled();
  await runtime.assertBackLink(owner);
  await runtime.screenshot(owner);
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
