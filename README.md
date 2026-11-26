# Walk-in Queue

Customers join your walk-in line from a link or QR code, take a number and follow their place live on their phone, while you and your co-managers call them in order.

Inspired by https://touri.ma

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Create a queue for a shop or desk, share its join link and QR code, pause joining, and add co-managers.
- Customers join with a first name and optional WhatsApp number and watch their live ticket.
- Run the day's board: call next, call anyone, mark served or no-show, add walk-ins and message people on WhatsApp.
- Numbers restart at 1 each day in the queue's time zone, and earlier days' tickets are deleted.

Left out: accounts and sign-in, which your Gateway handles; customer cards and favourites; a public business directory; browser notifications; languages other than English; installing as a phone app.

## Setup

- Install from the release: `pnpm everyapp install <release url>`, or from source with `pnpm install` then `pnpm run deploy`.
- Run locally: `pnpm dev`. Test: `pnpm test`, and `pnpm types:check`.
- There are no secrets or settings to set. The app uses one D1 database and a cron every 30 minutes that deletes earlier days' tickets.
- Every member can open the app. The join pages (`/q/...`) and their JSON (`/api/public/q/...`) are public, so customers need no account.

## Limitations

- WhatsApp alerts are sent by hand: the board opens WhatsApp with the message filled in.
- Ticket and board pages refresh every few seconds rather than instantly.
- A co-manager must have opened the app once before the owner can add them by email.
- The acceptance checks run against a local runtime; a real deployment and WhatsApp itself were not exercised.
