import { QueueError } from "./queues";

const STATUS = { not_found: 404, forbidden: 403, invalid: 400, conflict: 409 };

/**
 * Run a public API handler: JSON out, never cached, and a QueueError as its
 * status with its message. These routes are listed under `public` in
 * everyapp.config.ts and read no identity: the slug and the ticket's own
 * token are all they trust.
 */
export async function publicJson(
  fn: () => Promise<unknown>,
  okStatus = 200,
): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  try {
    return Response.json(await fn(), { status: okStatus, headers });
  } catch (error) {
    if (error instanceof QueueError) {
      return Response.json(
        { error: error.message },
        { status: STATUS[error.code], headers },
      );
    }
    throw error;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
