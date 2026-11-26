import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock, MapPin } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/client/components/ui/empty";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Spinner } from "@/client/components/ui/spinner";
import {
  call,
  storeTicket,
  storedTicket,
  type PublicQueue,
  type PublicTicket,
} from "@/client/queue/publicApi";

// Public (everyapp.config.ts): anyone with the link joins here.
export const Route = createFileRoute("/q/$slug/")({
  head: () => ({ meta: [{ title: "Join the queue" }] }),
  component: JoinPage,
});

function JoinPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<PublicQueue | null>(null);
  const [missing, setMissing] = useState(false);
  const [checked, setChecked] = useState(false);

  // A ticket this browser already holds for today leads back to it.
  useEffect(() => {
    const token = storedTicket(slug);
    if (!token) {
      setChecked(true);
      return;
    }
    call<PublicTicket>(`/api/public/q/${slug}/t/${token}`).then((result) => {
      const status = result.ok ? result.data.ticket.status : null;
      if (status === "waiting" || status === "called") {
        void navigate({
          to: "/q/$slug/t/$token",
          params: { slug, token },
          replace: true,
        });
        return;
      }
      if (!result.ok && result.status === 404) storeTicket(slug, null);
      setChecked(true);
    });
  }, [slug, navigate]);

  useEffect(() => {
    let live = true;
    const load = () =>
      call<PublicQueue>(`/api/public/q/${slug}`).then((result) => {
        if (!live) return;
        if (result.ok) setQueue(result.data);
        else if (result.status === 404) setMissing(true);
      });
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [slug]);

  if (missing) {
    return (
      <AppShell>
        <Empty className="border border-dashed border-border">
          <EmptyHeader>
            <EmptyTitle>This queue doesn't exist</EmptyTitle>
            <EmptyDescription>
              Check the link with the business.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </AppShell>
    );
  }
  if (!queue || !checked) {
    return (
      <AppShell>
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <PageHeader
        title={<span data-testid="queue-title">{queue.name}</span>}
        description={
          queue.address || queue.hours ? (
            <div className="space-y-1">
              {queue.address ? (
                <p
                  data-testid="queue-address"
                  className="flex items-start gap-1.5"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {queue.address}
                </p>
              ) : null}
              {queue.hours ? (
                <p
                  data-testid="queue-hours"
                  className="flex items-start gap-1.5 whitespace-pre-line"
                >
                  <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {queue.hours}
                </p>
              ) : null}
            </div>
          ) : undefined
        }
      />
      <Card size="sm">
        <CardContent className="flex items-baseline gap-2">
          <span
            data-testid="waiting-count"
            className="text-3xl font-semibold tabular-nums"
          >
            {queue.waiting}
          </span>
          <span className="text-sm text-muted-foreground">
            {queue.waiting === 1 ? "person waiting" : "people waiting"}
          </span>
        </CardContent>
      </Card>
      {queue.paused ? (
        <Alert data-testid="queue-closed">
          <AlertTitle>The queue is closed for now</AlertTitle>
        </Alert>
      ) : (
        <JoinForm slug={slug} />
      )}
    </AppShell>
  );
}

function JoinForm({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await call<{ token: string }>(`/api/public/q/${slug}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, phone }),
    });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    storeTicket(slug, result.data.token);
    await navigate({
      to: "/q/$slug/t/$token",
      params: { slug, token: result.data.token },
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="join-name">First name</Label>
        <Input
          id="join-name"
          data-testid="join-name"
          required
          maxLength={40}
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="join-phone">WhatsApp number (optional)</Label>
        <Input
          id="join-phone"
          data-testid="join-phone"
          type="tel"
          autoComplete="tel"
          placeholder="+44 7700 900123"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          The business can message you here when it's your turn.
        </p>
      </div>
      {error ? (
        <Alert variant="destructive" data-testid="join-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="submit"
        size="lg"
        data-testid="join-submit"
        pending={pending}
      >
        Join the queue
      </Button>
    </form>
  );
}
