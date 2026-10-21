import Link from "next/link";
import type { RsvpEvent } from "@/lib/rsvp/rsvp-event";

// Preserved for future use; intentionally not rendered by any public page.
export default function UpcomingEvents({ events, selectedSlug }: { events: RsvpEvent[]; selectedSlug?: string }) {
  return (
    <>
      {events.length > 1 && (
        <nav aria-label="Available events" className="border-border border-b p-6">
          <h2 className="font-heading text-2xl">Upcoming events</h2>
          <ul className="mt-3 flex flex-wrap gap-4">
            {events.map((item) => (
              <li key={item.slug}>
                <Link href={{ pathname: "/", query: { event: item.slug } }} aria-current={item.slug === selectedSlug ? "page" : undefined} className="underline underline-offset-4">
                  {item.name} —{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${item.event_date}T12:00:00Z`))}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
