import { useMemo } from "react";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";

export interface QueueDetailsValue {
  name: string;
  address: string;
  hours: string;
  timeZone: string;
}

export const emptyDetails: QueueDetailsValue = {
  name: "",
  address: "",
  hours: "",
  timeZone: "UTC",
};

/** Name, address, opening hours and time zone, as the create and settings forms share them. */
export function QueueDetailsFields({
  value,
  onChange,
}: {
  value: QueueDetailsValue;
  onChange: (value: QueueDetailsValue) => void;
}) {
  const zones = useMemo(timeZones, []);
  const set = (key: keyof QueueDetailsValue) => (next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="queue-name">Name</Label>
        <Input
          id="queue-name"
          data-testid="queue-name"
          required
          maxLength={80}
          value={value.name}
          onChange={(e) => set("name")(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="queue-address">Address</Label>
        <Input
          id="queue-address"
          data-testid="queue-address"
          maxLength={200}
          value={value.address}
          onChange={(e) => set("address")(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="queue-hours">Opening hours</Label>
        <Textarea
          id="queue-hours"
          data-testid="queue-hours"
          rows={2}
          maxLength={200}
          placeholder="Mon-Fri 9:00-18:00"
          value={value.hours}
          onChange={(e) => set("hours")(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="queue-timezone">Time zone</Label>
        <Input
          id="queue-timezone"
          data-testid="queue-timezone"
          list="queue-timezones"
          value={value.timeZone}
          onChange={(e) => set("timeZone")(e.target.value)}
        />
        <datalist id="queue-timezones">
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          The queue starts again from number 1 at midnight here.
        </p>
      </div>
    </div>
  );
}

function timeZones(): string[] {
  const intl = Intl as { supportedValuesOf?: (key: string) => string[] };
  return ["UTC", ...(intl.supportedValuesOf?.("timeZone") ?? [])];
}
