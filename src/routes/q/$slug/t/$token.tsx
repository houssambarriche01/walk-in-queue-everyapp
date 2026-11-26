import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/client/components/ui/empty";
import { Spinner } from "@/client/components/ui/spinner";
import {
  call,
  storeTicket,
  type PublicTicket,
  type TicketStatus,
} from "@/client/queue/publicApi";

// Public (everyapp.config.ts): one customer's ticket, by its own token.
export const Route = createFileRoute("/q/$slug/t/$token")({
  head: () => ({ meta: [{ title: "Your ticket" }] }),
  component: TicketPage,
});

const STATUS_LABEL: Record<TicketStatus, string> = {
  waiting: "Waiting",
  called: "Called",
  served: "Served",
  no_show: "No-show",
  left: "Left",
};

function TicketPage() {
  const { slug, token } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<PublicTicket | null>(null);
  const [missing, setMissing] = useState(false);
  const path = `/api/public/q/${slug}/t/${token}`;

  const load = useCallback(async () => {
    const result = await call<PublicTicket>(path);
    if (result.ok) setState(result.data);
    else if (result.status === 404) {
      storeTicket(slug, null);
      setMissing(true);
    }
  }, [path, slug]);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 3000);
    return () => clearInterval(id);
  }, [load]);

  const joinAgain = () => {
    storeTicket(slug, null);
    void navigate({ to: "/q/$slug", params: { slug } });
  };

  if (missing) {
    return (
      <AppShell>
        <Empty className="border border-dashed border-border">
          <EmptyHeader>
            <EmptyTitle>This ticket isn't in today's queue</EmptyTitle>
            <EmptyDescription>
              It was removed, or it's from an earlier day.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              render={<Link to="/q/$slug" params={{ slug }} />}
            >
              Join the queue
            </Button>
          </EmptyContent>
        </Empty>
      </AppShell>
    );
  }
  if (!state) {
    return (
      <AppShell>
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </AppShell>
    );
  }

  const { queue, ticket } = state;
  return (
    <AppShell>
      <PageHeader
        title={queue.name}
        description={`Ticket for ${ticket.name}`}
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="text-sm text-muted-foreground">Your number</span>
          <span
            data-testid="ticket-number"
            className="text-6xl font-semibold tabular-nums"
          >
            {ticket.number}
          </span>
          <span
            data-testid="ticket-status"
            className="rounded-full bg-muted px-3 py-1 text-sm font-medium"
          >
            {STATUS_LABEL[ticket.status]}
          </span>
          {ticket.status === "waiting" ? (
            <span data-testid="ticket-ahead" className="text-lg">
              {ticket.ahead === 0
                ? "You're next"
                : `${ticket.ahead} ${ticket.ahead === 1 ? "person" : "people"} ahead of you`}
            </span>
          ) : null}
        </CardContent>
      </Card>
      {ticket.status === "called" ? (
        <Alert variant="success">
          <AlertTitle>It's your turn</AlertTitle>
          <AlertDescription>Head to the counter now.</AlertDescription>
        </Alert>
      ) : null}
      {ticket.status === "waiting" ? (
        <LeaveButton path={path} onLeft={load} />
      ) : null}
      {ticket.status !== "waiting" && ticket.status !== "called" ? (
        <Button variant="outline" onClick={joinAgain} disabled={queue.paused}>
          Join again
        </Button>
      ) : null}
    </AppShell>
  );
}

function LeaveButton({
  path,
  onLeft,
}: {
  path: string;
  onLeft: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setPending(true);
    setError(null);
    const result = await call(`${path}/leave`, { method: "POST" });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    await onLeft();
  }

  return (
    <>
      <Button
        variant="outline"
        data-testid="leave-queue"
        onClick={() => setOpen(true)}
      >
        Leave the queue
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave the queue?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You'll lose your place.
          </p>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Stay
            </Button>
            <Button
              variant="destructive"
              data-testid="confirm-leave"
              pending={pending}
              onClick={leave}
            >
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
