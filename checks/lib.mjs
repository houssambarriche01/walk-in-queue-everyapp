// Shared steps for the suites. Selectors are the app's test IDs.
import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

/** Create a queue from the home page as the page's user; returns its ids. */
export async function createQueue(
  page,
  { name, address = "", hours = "", timeZone = "" },
) {
  await page.goto("/");
  await page.getByTestId("new-queue").click();
  await page.getByTestId("queue-name").fill(name);
  if (address) await page.getByTestId("queue-address").fill(address);
  if (hours) await page.getByTestId("queue-hours").fill(hours);
  if (timeZone) await page.getByTestId("queue-timezone").fill(timeZone);
  await Promise.all([
    page.waitForURL(/\/queues\/[^/]+$/),
    page.getByTestId("create-queue-submit").click(),
  ]);
  const id = new URL(page.url()).pathname.split("/").pop();
  await expect(page.getByTestId("join-link")).toContainText("/q/");
  const joinUrl = (await page.getByTestId("join-link").textContent()).trim();
  const slug = new URL(joinUrl).pathname.split("/").pop();
  return { id, slug, joinUrl };
}

/** Join a queue through the public API as an anonymous visitor. */
export async function join(runtime, slug, body) {
  const res = await runtime.fetch(`/api/public/q/${slug}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    json: res.status < 300 ? await res.json() : await res.text(),
  };
}

export async function getJson(runtime, path, role) {
  const res = await runtime.fetch(path, role ? { role } : {});
  return {
    status: res.status,
    json: res.status === 200 ? await res.json() : null,
  };
}

/** The email the Gateway gives a role, as the app sees it. */
export async function emailOf(runtime, role) {
  const res = await runtime.fetch("/health", { role });
  expect(res.status).toBe(200);
  return (await res.json()).user;
}

/**
 * Run `trigger` and capture the server function request it sends without
 * letting it reach the app; returns what is needed to replay it as anyone.
 */
export async function captureServerFn(page, trigger) {
  let captured;
  await page.route("**/_serverFn/**", async (route) => {
    const req = route.request();
    if (req.method() !== "POST" || captured) return route.continue();
    const headers = {};
    for (const [k, v] of Object.entries(req.headers())) {
      if (["host", "cookie", "content-length", "origin", "referer"].includes(k))
        continue;
      if (k.startsWith("x-everyapp") || k.startsWith("cf-")) continue;
      headers[k] = v;
    }
    captured = {
      path: new URL(req.url()).pathname + new URL(req.url()).search,
      headers,
      body: req.postData(),
    };
    await route.abort();
  });
  await trigger();
  await expect.poll(() => Boolean(captured)).toBe(true);
  await page.unroute("**/_serverFn/**");
  return captured;
}

export async function replay(runtime, captured, role, transform = (b) => b) {
  return runtime.fetch(captured.path, {
    role,
    method: "POST",
    headers: captured.headers,
    body: transform(captured.body),
  });
}
