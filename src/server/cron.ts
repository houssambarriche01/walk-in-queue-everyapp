import { deleteEarlierTickets } from "./queues";

/** The half-hourly cleanup: tickets from before each queue's local today go. */
export async function runCleanup(scheduledTime: number): Promise<void> {
  await deleteEarlierTickets(new Date(scheduledTime));
}
