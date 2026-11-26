// The app's tools for AI clients. The Gateway serves them at /mcp and calls
// each with the signed-in user; each query checks the user's role itself.
import { ToolError, defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import * as q from "@/server/queues";

async function asTool<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof q.QueueError) throw new ToolError(error.message);
    throw error;
  }
}

export const tools = defineTools({
  list_queues: {
    description:
      "List the queues the user owns or co-manages, with how many people are waiting today.",
    risk: "read",
    input: z.object({}).strict(),
    handler: async (_input, { user }) => {
      await q.rememberMember(user);
      return q.listQueues(user);
    },
  },
  get_board: {
    description:
      "Today's tickets of one queue the user manages, in number order.",
    risk: "read",
    input: q.queueIdInput,
    handler: (input, { user }) => asTool(() => q.board(user, input.queueId)),
  },
  call_next: {
    description:
      "Call the next waiting ticket of a queue the user manages. Returns its number, or null when no one is waiting.",
    risk: "write",
    idempotent: false,
    input: q.queueIdInput,
    handler: (input, { user }) => asTool(() => q.callNext(user, input.queueId)),
  },
});
