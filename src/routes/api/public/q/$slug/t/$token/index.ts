import { createFileRoute } from "@tanstack/react-router";
import { publicTicket } from "@/server/queues";
import { publicJson } from "@/server/publicApi";

// Public: one customer's own ticket, found by its unguessable token.
export const Route = createFileRoute("/api/public/q/$slug/t/$token/")({
  server: {
    handlers: {
      GET: ({ params }) =>
        publicJson(() => publicTicket(params.slug, params.token)),
    },
  },
});
