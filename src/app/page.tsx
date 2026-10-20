import BrandPanel from "@/components/event/BrandPanel";
import EventHero from "@/components/event/EventHero";
import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";
import RsvpExperience from "@/components/rsvp/RsvpExperience";
import RsvpResult from "@/components/rsvp/RsvpResult";
import RsvpClosed from "@/components/rsvp/RsvpClosed";
import Link from "next/link";
import { getAvailableRsvpEvents } from "@/lib/rsvp-event";
import { submitRsvp } from "./actions";
import { diagnosticReference, reportRsvpFailure, RsvpDiagnosticError } from "@/lib/rsvp-diagnostics";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  const requested = (await searchParams).event;
  let events;
  try { events = await getAvailableRsvpEvents(); }
  catch (error) {
    const failure = error instanceof RsvpDiagnosticError ? error : reportRsvpFailure({
      operation: "event.discovery", stage: "unexpected_result", code: "UNKNOWN",
    });
    return <main className="paper-surface mx-auto max-w-5xl p-10 m-auto">
      <h1 className="font-heading text-4xl">Events temporarily unavailable</h1>
      <p className="mt-4">We couldn’t load upcoming events. Please try again shortly.</p>
      <p className="mt-3 text-sm">{diagnosticReference(failure).trim()}</p>
    </main>;
  }
  const event = requested === undefined ? events[0]
    : typeof requested === "string" ? events.find(item => item.slug === requested) : undefined;

  return (
    <div className="paper-surface mx-auto w-full overflow-clip border-x border-[#8b572e45]
      shadow-[0_0_60px_#35271935]">
      <a href="#main" className="absolute -top-25 left-4 z-30 bg-surface px-5 py-3">Skip to content</a>
      <SiteHeader />
      <main id="main">
        {events.length > 1 && <nav aria-label="Available events" className="border-b border-border p-6">
          <h2 className="font-heading text-2xl">Upcoming events</h2>
          <ul className="mt-3 flex flex-wrap gap-4">{events.map(item => <li key={item.slug}>
            <Link href={{ pathname: "/", query: { event: item.slug } }}
              aria-current={item.slug === event?.slug ? "page" : undefined}
              className="underline underline-offset-4">
              {item.name} — {new Intl.DateTimeFormat("en-US", {
                month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
              }).format(new Date(`${item.event_date}T12:00:00Z`))}
            </Link>
          </li>)}</ul>
        </nav>}
        {event?.open ? <RsvpExperience
          key={event.slug}
          submitAction={submitRsvp.bind(null, event.slug)}
          disclaimerVersion={event.disclaimer_version}
          hero={<EventHero event={event} />}
          aside={<BrandPanel />}
          success={<RsvpResult kind="success" event={event} />}
          duplicate={<RsvpResult kind="duplicate" event={event} />}
        /> : <RsvpClosed selectedEventUnavailable={requested !== undefined} />}
      </main>
      <SiteFooter />
    </div>
  );
}
