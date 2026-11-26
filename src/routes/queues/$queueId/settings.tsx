import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { QueueNotFound } from "@/client/queue/NotFoundCard";
import { QueueDetailsFields } from "@/client/queue/QueueDetailsFields";
import { messageOf } from "@/client/queue/errors";
import {
  addManager,
  deleteQueue,
  getSettings,
  removeManager,
  updateQueue,
} from "@/serverFunctions/queues";

export const Route = createFileRoute("/queues/$queueId/settings")({
  loader: ({ params }) => getSettings({ data: { queueId: params.queueId } }),
  head: () => ({ meta: [{ title: "Queue settings · Walk-in Queue" }] }),
  component: SettingsPage,
});

type Settings = NonNullable<Awaited<ReturnType<typeof getSettings>>>;

function SettingsPage() {
  const settings = Route.useLoaderData();
  if (!settings) {
    return (
      <AppShell>
        <QueueNotFound />
      </AppShell>
    );
  }
  return (
    <AppShell>
      <PageHeader
        backLink={
          <Link
            to="/queues/$queueId"
            params={{ queueId: settings.id }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {settings.name}
          </Link>
        }
        title="Queue settings"
      />
      {settings.role === "owner" ? (
        <>
          <DetailsForm settings={settings} />
          <Managers settings={settings} />
          <DeleteQueue settings={settings} />
        </>
      ) : (
        <Alert data-testid="owner-only">
          <AlertDescription>
            Only the queue's owner can change its details and co-managers.
          </AlertDescription>
        </Alert>
      )}
    </AppShell>
  );
}

function DetailsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [details, setDetails] = useState({
    name: settings.name,
    address: settings.address,
    hours: settings.hours,
    timeZone: settings.timeZone,
  });
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await updateQueue({ data: { queueId: settings.id, ...details } });
      setSaved(true);
      await router.invalidate();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>Shown on the join page.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <QueueDetailsFields
            value={details}
            onChange={(next) => {
              setDetails(next);
              setSaved(false);
            }}
          />
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" data-testid="save-details" pending={pending}>
              Save
            </Button>
            {saved ? (
              <span
                data-testid="details-saved"
                className="text-sm text-muted-foreground"
              >
                Saved
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Managers({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addManager({ data: { queueId: settings.id, email } });
      setEmail("");
      await router.invalidate();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPending(false);
    }
  }

  async function remove(userId: string) {
    try {
      await removeManager({ data: { queueId: settings.id, userId } });
      await router.invalidate();
    } catch (e) {
      toast.error(messageOf(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Co-managers</CardTitle>
        <CardDescription>
          They can call people, add walk-ins and pause joining.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {settings.managers.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {settings.managers.map((manager) => (
              <li
                key={manager.userId}
                data-testid="manager-row"
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="truncate">{manager.email}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(manager.userId)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={submit} className="grid gap-2">
          <Label htmlFor="manager-email">Add by email</Label>
          <div className="flex gap-2">
            <Input
              id="manager-email"
              data-testid="manager-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              data-testid="add-manager"
              pending={pending}
            >
              Add
            </Button>
          </div>
          {error ? (
            <p data-testid="manager-error" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function DeleteQueue({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await deleteQueue({ data: { queueId: settings.id } });
      setOpen(false);
      await router.navigate({ to: "/" });
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete queue</CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          data-testid="delete-queue"
          onClick={() => setOpen(true)}
        >
          Delete queue
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {settings.name}?</DialogTitle>
              <DialogDescription>
                Its link stops working and today's tickets are deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                data-testid="confirm-delete"
                pending={pending}
                onClick={confirm}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
