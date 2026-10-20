import type { RsvpEvent } from "@/lib/rsvp-event";

export default function CurrentEventDetails({ event }: { event: RsvpEvent }) {
  const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${event.event_date}T12:00:00Z`));
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: event.timezone, timeZoneName: "short" });
  return <div className="mt-5 space-y-2 text-lg">
    <p><time dateTime={event.event_date}>{date}</time></p>
    <p>{time.format(new Date(event.starts_at))} – {time.format(new Date(event.ends_at))}</p>
    <p>{event.venue_name}<br />{event.venue_address}</p>
  </div>;
}
