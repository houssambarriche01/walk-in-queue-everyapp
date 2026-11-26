import { createFileRoute } from "@tanstack/react-router";
import { leaveQueue } from "@/server/queues";
import { publicJson } from "@/server/publicApi";

// Public: a waiting customer leaves the queue.
export const Route = createFileRoute("/api/public/q/$slug/t/$token/leave")({
  server: {
    handlers: {
      POST: ({ params }) =>
        publicJson(() => leaveQueue(params.slug, params.token)),
    },
  },
});
