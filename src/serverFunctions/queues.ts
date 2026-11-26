import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import * as q from "@/server/queues";

// Every function runs behind ensureUserMiddleware: `context.user` is the
// member the Gateway signed in. Each query checks the member's role on the
// queue (owner or co-manager) itself.
const member = createServerFn().middleware([ensureUserMiddleware]);
const memberPost = createServerFn({ method: "POST" }).middleware([
  ensureUserMiddleware,
]);

const STATUS = { not_found: 404, forbidden: 403, invalid: 400, conflict: 409 };

/** A refusal reaches the page as its message, with its HTTP status. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof q.QueueError) {
      setResponseStatus(STATUS[error.code]);
      throw new Error(error.message);
    }
    throw error;
  }
}

export const getQueues = member.handler(async ({ context: { user } }) => {
  await q.rememberMember(user);
  return q.listQueues(user);
});

export const createQueue = memberPost
  .validator((data: unknown) => q.queueDetailsInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await q.rememberMember(user);
    return q.createQueue(user, data);
  });

/** Null when the queue doesn't exist or isn't the member's to see. */
async function orNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof q.QueueError && error.code === "not_found")
      return null;
    throw error;
  }
}

export const getBoard = member
  .validator((data: unknown) => q.queueIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const board = await orNull(() => q.board(user, data.queueId));
    if (!board) return null;
    // The join link on the app's own host, as the request reached it.
    const origin = new URL(getRequest().url).origin;
    return { ...board, joinUrl: `${origin}/q/${board.queue.slug}` };
  });

export const getSettings = member
  .validator((data: unknown) => q.queueIdInput.parse(data))
  .handler(({ data, context: { user } }) =>
    orNull(() => q.queueSettings(user, data.queueId)),
  );

export const updateQueue = memberPost
  .validator((data: unknown) => q.updateQueueInput.parse(data))
  .handler(({ data, context: { user } }) =>
    run(() => q.updateQueue(user, data)),
  );

export const deleteQueue = memberPost
  .validator((data: unknown) => q.queueIdInput.parse(data))
  .handler(({ data, context: { user } }) =>
    run(() => q.deleteQueue(user, data.queueId)),
  );

export const setPaused = memberPost
  .validator((data: unknown) => q.pauseInput.parse(data))
  .handler(({ data, context: { user } }) =>
    run(() => q.setPaused(user, data.queueId, data.paused)),
  );

export const addManager = memberPost
  .validator((data: unknown) => q.managerInput.parse(data))
  .handler(({ data, context: { user } }) =>
    run(() => q.addManager(user, data.queueId, data.email)),
  );

export const removeManager = memberPost
  .validator((data: unknown) => q.removeManagerInput.parse(data))
  .handler(({ data, context: { user } }) =>
    run(() => q.removeManager(user, data.queueId, data.userId)),
  );

export const callNext = memberPost
  .validator((data: unknown) => q.queueIdInput.parse(data))
  .handler(({ data, context: { user } }) =>
    run(() => q.callNext(user, data.queueId)),
  );

export const ticketAction = memberPost
  .validator((data: unknown) => q.ticketActionInput.parse(data))
  .handler(({ data, context: { user } }) =>
    run(() => q.ticketAction(user, data)),
  );

export const addWalkIn = memberPost
  .validator((data: unknown) => q.walkInInput.parse(data))
  .handler(({ data, context: { user } }) => run(() => q.addWalkIn(user, data)));
