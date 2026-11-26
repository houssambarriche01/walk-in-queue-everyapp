import { createFileRoute } from "@tanstack/react-router";
import { publicQueue } from "@/server/queues";
import { publicJson } from "@/server/publicApi";

// Public: the join page's details and current wait.
export const Route = createFileRoute("/api/public/q/$slug/")({
  server: {
    handlers: {
      GET: ({ params }) => publicJson(() => publicQueue(params.slug)),
    },
  },
});
