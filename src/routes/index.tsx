import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
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
import {
  QueueDetailsFields,
  emptyDetails,
} from "@/client/queue/QueueDetailsFields";
import { messageOf } from "@/client/queue/errors";
import { createQueue, getQueues } from "@/serverFunctions/queues";

export const Route = createFileRoute("/")({
  loader: () => getQueues(),
  head: () => ({ meta: [{ title: "Queues · Walk-in Queue" }] }),
  component: Home,
});

function Home() {
  const queues = Route.useLoaderData();
  const [open, setOpen] = useState(false);
  return (
    <AppShell>
      <PageHeader
        title="Queues"
        actions={
          <Button data-testid="new-queue" onClick={() => setOpen(true)}>
            <Plus aria-hidden />
            New queue
          </Button>
        }
      />
      {queues.length === 0 ? (
        <Empty className="border border-dashed border-border">
          <EmptyHeader>
            <EmptyTitle>No queues yet</EmptyTitle>
            <EmptyDescription>
              Create one and share its link with customers.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => setOpen(true)}>
              New queue
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="grid gap-3">
          {queues.map((queue) => (
            <li key={queue.id}>
              <Card
                className="p-0 transition-colors hover:bg-muted/50"
                size="sm"
              >
                <Link
                  to="/queues/$queueId"
                  params={{ queueId: queue.id }}
                  data-testid="queue-row"
                  className="flex items-center gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{queue.name}</span>
                      {queue.paused ? (
                        <Badge variant="warning">Paused</Badge>
                      ) : null}
                      {queue.role === "manager" ? (
                        <Badge variant="outline">Co-manager</Badge>
                      ) : null}
                    </div>
                    {queue.address ? (
                      <p className="truncate text-sm text-muted-foreground">
                        {queue.address}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums">
                      {queue.waiting}
                    </div>
                    <div className="text-xs text-muted-foreground">waiting</div>
                  </div>
                  <ChevronRight
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <NewQueueDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}

function NewQueueDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [details, setDetails] = useState(emptyDetails);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { id } = await createQueue({ data: details });
      onOpenChange(false);
      setDetails(emptyDetails);
      await router.navigate({
        to: "/queues/$queueId",
        params: { queueId: id },
      });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New queue</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <QueueDetailsFields value={details} onChange={setDetails} />
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              data-testid="create-queue-submit"
              pending={pending}
            >
              Create queue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
