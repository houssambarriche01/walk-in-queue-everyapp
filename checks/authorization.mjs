// Authorization: private paths, public surface, ownership and co-manager rules (X001).
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import {
  createQueue,
  join,
  getJson,
  emailOf,
  captureServerFn,
  replay,
} from "./lib.mjs";

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(["/", "/health"]);

  const owner = await (await runtime.context("owner")).newPage();
  const member = await (await runtime.context("member")).newPage();
  const ownerEmail = await emailOf(runtime, "owner");
  const memberEmail = await emailOf(runtime, "member");
  await member.goto("/");

  const shop = await createQueue(owner, {
    name: "Lakeside Bakery",
    address: "3 Quay Road",
    hours: "Daily 7-15",
  });
  const a = await join(runtime, shop.slug, {
    name: "Ingrid",
    phone: "+47 912 34 567",
  });
  const b = await join(runtime, shop.slug, { name: "Oskar" });
  expect(a.status).toBe(201);
  expect(b.status).toBe(201);

  // Anonymous and outsiders never reach member pages.
  for (const role of [undefined, "outsider"]) {
    for (const path of [`/queues/${shop.id}`, `/queues/${shop.id}/settings`]) {
      const res = await runtime.fetch(path, role ? { role } : {});
      expect(res.status, `${role ?? "anonymous"} ${path}`).not.toBe(200);
    }
  }

  // Public routes expose only the queue's public details and one's own ticket.
  const info = await runtime.fetch(`/api/public/q/${shop.slug}`);
  const infoText = await info.text();
  expect(info.status).toBe(200);
  for (const secret of ["Ingrid", "Oskar", "912", ownerEmail, shop.id])
    expect(infoText).not.toContain(secret);
  const mine = await runtime.fetch(
    `/api/public/q/${shop.slug}/t/${b.json.token}`,
  );
  const mineText = await mine.text();
  expect(mine.status).toBe(200);
  for (const secret of ["Ingrid", "912", a.json.token, ownerEmail])
    expect(mineText).not.toContain(secret);
  expect(
    (await runtime.fetch(`/api/public/q/${shop.slug}/t/${"x".repeat(32)}`))
      .status,
  ).toBe(404);
  // A ticket token only works under its own queue.
  const other = await createQueue(owner, { name: "Lakeside Bakery Annex" });
  expect(
    (await runtime.fetch(`/api/public/q/${other.slug}/t/${b.json.token}`))
      .status,
  ).toBe(404);
  expect(
    (
      await runtime.fetch(
        `/api/public/q/${other.slug}/t/${b.json.token}/leave`,
        { method: "POST" },
      )
    ).status,
  ).toBe(404);
  // Public routes take no other methods.
  expect(
    (await runtime.fetch(`/api/public/q/${shop.slug}`, { method: "DELETE" }))
      .status,
  ).not.toBe(200);

  // A member who isn't a manager can't see the queue, its board or its settings.
  await member.goto("/");
  await expect(
    member.getByTestId("queue-row").filter({ hasText: "Lakeside Bakery" }),
  ).toHaveCount(0);
  await member.goto(`/queues/${shop.id}`);
  await expect(member.getByTestId("not-found")).toBeVisible();
  await expect(member.locator("body")).not.toContainText("Ingrid");
  await member.goto(`/queues/${shop.id}/settings`);
  await expect(member.getByTestId("not-found")).toBeVisible();

  // ...and can't act on it with the owner's own request.
  await owner.goto(`/queues/${shop.id}`);
  await expect(owner.getByTestId("ticket-1")).toBeVisible();
  const callNext = await captureServerFn(owner, () =>
    owner.getByTestId("call-next").click(),
  );
  const db = await runtime.database();
  const statusOf = async (n) =>
    (
      await db
        .prepare("select status from tickets where queue_id = ? and number = ?")
        .bind(shop.id, n)
        .first()
    )?.status;
  const asMember = await replay(runtime, callNext, "member");
  expect(asMember.status).not.toBe(200);
  expect(await statusOf(1)).toBe("waiting");
  const asOutsider = await replay(runtime, callNext, "outsider");
  expect(asOutsider.status).not.toBe(200);
  const anonymous = await runtime.fetch(callNext.path, {
    method: "POST",
    headers: callNext.headers,
    body: callNext.body,
  });
  expect(anonymous.status).not.toBe(200);
  expect(await statusOf(1)).toBe("waiting");
  // The same request works for the owner, so the refusals above are real.
  expect((await replay(runtime, callNext, "owner")).status).toBe(200);
  expect(await statusOf(1)).toBe("called");

  // A co-manager runs the board but can't edit details, delete or change co-managers.
  await owner.goto(`/queues/${shop.id}/settings`);
  await owner.getByTestId("manager-email").fill(memberEmail);
  await owner.getByTestId("add-manager").click();
  await expect(owner.getByTestId("manager-row")).toHaveCount(1);
  const save = await captureServerFn(owner, async () => {
    await owner.getByTestId("queue-hours").fill("Owner hours");
    await owner.getByTestId("save-details").click();
  });
  const hoursOf = async () =>
    (
      await db
        .prepare("select hours from queues where id = ?")
        .bind(shop.id)
        .first()
    ).hours;
  expect(
    (
      await replay(runtime, save, "member", (body) =>
        body.replace("Owner hours", "Changed by co-manager"),
      )
    ).status,
  ).not.toBe(200);
  expect(await hoursOf()).toBe("Daily 7-15");
  const addManager = await captureServerFn(owner, async () => {
    await owner.getByTestId("manager-email").fill(ownerEmail);
    await owner.getByTestId("add-manager").click();
  });
  const removeManager = await captureServerFn(owner, () =>
    owner
      .getByTestId("manager-row")
      .first()
      .getByRole("button", { name: "Remove" })
      .click(),
  );
  expect((await replay(runtime, removeManager, "member")).status).not.toBe(200);
  const managers = async () =>
    (
      await db
        .prepare("select count(*) as n from queue_managers where queue_id = ?")
        .bind(shop.id)
        .first()
    ).n;
  expect(await managers()).toBe(1);
  expect((await replay(runtime, addManager, "member")).status).not.toBe(200);
  const remove = await captureServerFn(owner, async () => {
    await owner.getByTestId("delete-queue").click();
    await owner.getByTestId("confirm-delete").click();
  });
  expect((await replay(runtime, remove, "member")).status).not.toBe(200);
  expect(
    (
      await db
        .prepare("select count(*) as n from queues where id = ?")
        .bind(shop.id)
        .first()
    ).n,
  ).toBe(1);
  // The co-manager's board works.
  await member.goto(`/queues/${shop.id}`);
  await expect(
    member.getByTestId("section-waiting").getByTestId("ticket-2"),
  ).toContainText("Oskar");

  // Queues are their owner's: the org owner (an admin) can't open a member's queue.
  const memberQueue = await createQueue(member, { name: "Night Clinic" });
  await owner.goto(`/queues/${memberQueue.id}`);
  await expect(owner.getByTestId("not-found")).toBeVisible();
  await owner.goto("/");
  await expect(
    owner.getByTestId("queue-row").filter({ hasText: "Night Clinic" }),
  ).toHaveCount(0);
  // Co-managers are found only among people who have used the app in the same organization.
  await member.goto(`/queues/${memberQueue.id}/settings`);
  await member.getByTestId("manager-email").fill("stranger@elsewhere.example");
  await member.getByTestId("add-manager").click();
  await expect(member.getByTestId("manager-error")).toBeVisible();

  // The app has no sign-in page of its own.
  for (const path of [
    "/login",
    "/signin",
    "/sign-in",
    "/signup",
    "/register",
    "/logout",
  ]) {
    for (const role of [undefined, "member"]) {
      const res = await runtime.fetch(path, role ? { role } : {});
      const text = await res.text();
      expect(text, `${path} ${role ?? "anonymous"}`).not.toMatch(
        /type="password"/i,
      );
      if (role) expect(res.status, path).toBe(404);
    }
  }
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
