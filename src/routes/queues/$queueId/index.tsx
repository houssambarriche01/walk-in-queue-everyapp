import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ChevronLeft,
  MessageCircle,
  Pause,
  Play,
  Settings,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { CopyButton } from "@/client/components/CopyButton";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { QueueNotFound } from "@/client/queue/NotFoundCard";
import { QrCode } from "@/client/queue/QrCode";
import { messageOf } from "@/client/queue/errors";
import { useLiveRoute } from "@/client/queue/usePolling";
import {
  addWalkIn,
  callNext,
  getBoard,
  setPaused,
  ticketAction,
} from "@/serverFunctions/queues";

export const Route = createFileRoute("/queues/$queueId/")({
  loader: ({ params }) => getBoard({ data: { queueId: params.queueId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.queue.name ?? "Queue"} · Walk-in Queue` }],
  }),
  component: BoardPage,
});

type Board = NonNullable<Awaited<ReturnType<typeof getBoard>>>;
type Ticket = Board["tickets"][number];
type Action = "call" | "serve" | "no_show" | "requeue" | "remove";

const BACK = (
  <Link
    to="/"
    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
  >
    <ChevronLeft className="size-4" aria-hidden />
    Queues
  </Link>
);

function BoardPage() {
  const board = Route.useLoaderData();
  useLiveRoute();
  if (!board) {
    return (
      <AppShell>
        <QueueNotFound />
      </AppShell>
    );
  }
  return <Board board={board} />;
}

function Board({ board }: { board: Board }) {
  const router = useRouter();
  const { queue } = board;
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      await router.invalidate();
    } catch (error) {
      toast.error(messageOf(error));
      await router.invalidate();
    } finally {
      setBusy(null);
    }
  }

  const waiting = board.tickets.filter((t) => t.status === "waiting");
  const called = board.tickets.filter((t) => t.status === "called");
  const done = board.tickets.filter(
    (t) => t.status !== "waiting" && t.status !== "called",
  );
  const served = board.tickets.filter((t) => t.status === "served").length;
  const onTicket = (ticket: Ticket, action: Action) =>
    act(`${ticket.id}:${action}`, () =>
      ticketAction({
        data: { queueId: queue.id, ticketId: ticket.id, action },
      }),
    );

  return (
    <AppShell>
      <PageHeader
        backLink={BACK}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {queue.name}
            {queue.paused ? <Badge variant="warning">Paused</Badge> : null}
          </span>
        }
        description={queue.address || undefined}
        actions={
          <>
            <Button
              variant="outline"
              data-testid="pause-toggle"
              pending={busy === "pause"}
              onClick={() =>
                act("pause", () =>
                  setPaused({
                    data: { queueId: queue.id, paused: !queue.paused },
                  }),
                )
              }
            >
              {queue.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
              {queue.paused ? "Resume joining" : "Pause joining"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Queue settings"
              render={
                <Link
                  to="/queues/$queueId/settings"
                  params={{ queueId: queue.id }}
                />
              }
            >
              <Settings aria-hidden />
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Waiting" testId="count-waiting" value={waiting.length} />
        <Stat label="Served today" testId="count-served" value={served} />
        <div className="col-span-2 flex items-center sm:col-span-1">
          <Button
            size="lg"
            className="h-full min-h-12 w-full"
            data-testid="call-next"
            disabled={waiting.length === 0}
            pending={busy === "next"}
            onClick={() =>
              act("next", () => callNext({ data: { queueId: queue.id } }))
            }
          >
            Call next
          </Button>
        </div>
      </div>

      <Section title="Called" testId="section-called" count={called.length}>
        {called.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} board={board}>
            <WhatsApp ticket={ticket} queueName={queue.name} />
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => onTicket(ticket, "serve")}
            >
              Served
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => onTicket(ticket, "no_show")}
            >
              No-show
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => onTicket(ticket, "requeue")}
            >
              Back to waiting
            </Button>
          </TicketRow>
        ))}
      </Section>

      <Section title="Waiting" testId="section-waiting" count={waiting.length}>
        {waiting.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} board={board}>
            <WhatsApp ticket={ticket} queueName={queue.name} />
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => onTicket(ticket, "call")}
            >
              Call
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => onTicket(ticket, "remove")}
            >
              Remove
            </Button>
          </TicketRow>
        ))}
      </Section>

      <WalkInForm queueId={queue.id} />

      <Section title="Done" testId="section-done" count={done.length}>
        {done.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} board={board}>
            <Badge variant={ticket.status === "served" ? "success" : "outline"}>
              {STATUS_LABEL[ticket.status]}
            </Badge>
            {ticket.status === "no_show" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => onTicket(ticket, "requeue")}
              >
                Back to waiting
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => onTicket(ticket, "remove")}
            >
              Remove
            </Button>
          </TicketRow>
        ))}
      </Section>

      <Card>
        <CardHeader>
          <CardTitle>Join link</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <QrCode value={board.joinUrl} />
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-muted-foreground">
              Anyone with the link can join
              {queue.paused ? " once you resume joining" : ""}.
            </p>
            <a
              href={board.joinUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="join-link"
              className="block truncate font-mono text-sm text-primary hover:underline"
            >
              {board.joinUrl}
            </a>
            <CopyButton
              value={board.joinUrl}
              successMessage="Link copied"
              label="Copy link"
            />
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

const STATUS_LABEL: Record<Ticket["status"], string> = {
  waiting: "Waiting",
  called: "Called",
  served: "Served",
  no_show: "No-show",
  left: "Left",
};

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <Card size="sm" className="gap-1 px-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div data-testid={testId} className="text-2xl font-semibold tabular-nums">
        {value}
      </div>
    </Card>
  );
}

function Section({
  title,
  count,
  testId,
  children,
}: {
  title: string;
  count: number;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId} className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        {title} · {count}
      </h2>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">No one.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {children}
        </ul>
      )}
    </section>
  );
}

function TicketRow({
  ticket,
  board,
  children,
}: {
  ticket: Ticket;
  board: Board;
  children: ReactNode;
}) {
  return (
    <li
      data-testid={`ticket-${ticket.number}`}
      data-status={ticket.status}
      className="flex flex-wrap items-center gap-3 px-4 py-3"
    >
      <span className="w-10 text-xl font-semibold tabular-nums">
        {ticket.number}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{ticket.name}</div>
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>Joined {joinTime(ticket.joinedAt, board.queue.timeZone)}</span>
          {ticket.phone ? <span>{ticket.phone}</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </li>
  );
}

function joinTime(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));
}

/** A wa.me link with the "your turn" message filled in; the manager sends it. */
function WhatsApp({
  ticket,
  queueName,
}: {
  ticket: Ticket;
  queueName: string;
}) {
  if (!ticket.phone) return null;
  const digits = ticket.phone.replace(/\D/g, "");
  const text = `Hi ${ticket.name}, it's your turn at ${queueName}. Your number is ${ticket.number}.`;
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={`Message ${ticket.name} on WhatsApp`}
      render={
        <a
          href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer"
          data-testid={`whatsapp-${ticket.number}`}
        />
      }
    >
      <MessageCircle aria-hidden />
      WhatsApp
    </Button>
  );
}

function WalkInForm({ queueId }: { queueId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const { number } = await addWalkIn({ data: { queueId, name, phone } });
      toast.success(`${name.trim()} is number ${number}`);
      setName("");
      setPhone("");
      await router.invalidate();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <div className="grid gap-2">
        <Label htmlFor="walkin-name">Walk-in name</Label>
        <Input
          id="walkin-name"
          data-testid="walkin-name"
          required
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="walkin-phone">WhatsApp number (optional)</Label>
        <Input
          id="walkin-phone"
          data-testid="walkin-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <Button type="submit" data-testid="walkin-submit" pending={pending}>
        Add to queue
      </Button>
    </form>
  );
}
