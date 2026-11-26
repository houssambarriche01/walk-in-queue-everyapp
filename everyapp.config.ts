import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "walk-in-queue",
  name: "Walk-in Queue",
  description:
    "Customers join your walk-in line from a link or QR code and follow their place live while you call them in order.",
  icon: "/icon.svg",
  resources: {
    // Queues, co-managers and today's tickets.
    d1: ["DB"],
  },
  // Every member can run queues of their own.
  access: "everyone",
  // Customers aren't members: they open the join and ticket pages and the
  // JSON those pages read and post. Each route trusts only the queue's
  // random slug and the ticket's own token (src/server/queues.ts).
  public: [
    { path: "/q/*", methods: ["GET"] },
    { path: "/q/*/t/*", methods: ["GET"] },
    { path: "/api/public/q/*", methods: ["GET"] },
    { path: "/api/public/q/*/join", methods: ["POST"] },
    { path: "/api/public/q/*/t/*", methods: ["GET"] },
    { path: "/api/public/q/*/t/*/leave", methods: ["POST"] },
  ],
  // The scripts, styles and icon the public pages load.
  publicAssets: ["/assets/**", "/icon.svg"],
});
