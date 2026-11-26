import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { runCleanup } from "./server/cron";
import { tools } from "./tools";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401), and serves the tools.
const app = everyApp<Env>(async (request) => tanstackEntry.fetch(request), {
  tools,
});

export default {
  ...app,
  // The cron in cloudflare.config.ts: delete tickets from earlier days.
  async scheduled(controller: ScheduledController) {
    await runCleanup(controller.scheduledTime);
  },
};
