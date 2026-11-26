import { Link } from "@tanstack/react-router";
import { Button } from "@/client/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/client/components/ui/empty";

/** A queue that doesn't exist, or that the member doesn't own or co-manage. */
export function QueueNotFound() {
  return (
    <Empty
      data-testid="not-found"
      className="border border-dashed border-border"
    >
      <EmptyHeader>
        <EmptyTitle>Queue not found</EmptyTitle>
        <EmptyDescription>
          It was deleted, or you aren't its owner or a co-manager.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/" />}>
          Your queues
        </Button>
      </EmptyContent>
    </Empty>
  );
}
