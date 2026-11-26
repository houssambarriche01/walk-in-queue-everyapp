import { createFileRoute } from "@tanstack/react-router";
import { joinQueue } from "@/server/queues";
import { publicJson, readJson } from "@/server/publicApi";

// Public: anyone with the link takes a number.
export const Route = createFileRoute("/api/public/q/$slug/join")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const body = await readJson(request);
        return publicJson(async () => {
          const ticket = await joinQueue(params.slug, body);
          return {
            ...ticket,
            ticketPath: `/q/${params.slug}/t/${ticket.token}`,
          };
        }, 201);
      },
    },
  },
});
