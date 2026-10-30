import { ticketReturnUrl } from "@/lib/tickets/config";
import TicketResult from "@/components/tickets/TicketResult";
import { initializeTicket, checkTicketSales } from "./ticket-actions";
import TicketPurchaseForm from "@/components/tickets/TicketPurchaseForm";
import TicketCta from "@/components/tickets/TicketCta";
import BrandPanel from "@/components/event/BrandPanel";
import EventHero from "@/components/event/EventHero";
import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";
import RsvpExperience from "@/components/rsvp/RsvpExperience";
import RsvpResult from "@/components/rsvp/RsvpResult";
import { getAvailableRsvpEvents, type RsvpEvent } from "@/lib/rsvp/rsvp-event";
import { submitRsvp } from "./actions";
import { diagnosticReference, reportRsvpFailure, RsvpDiagnosticError } from "@/lib/rsvp/rsvp-diagnostics";
import EventClosed from "@/components/rsvp/EventClosed";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ event?: string | string[] }> }) {
  const requested = (await searchParams).event;
  let events;
  try {
    events = await getAvailableRsvpEvents();
  } catch (error) {
    const failure =
      error instanceof RsvpDiagnosticError
        ? error
        : reportRsvpFailure({
            operation: "event.discovery",
            stage: "unexpected_result",
            code: "UNKNOWN",
          });
    return (
      <main className="paper-surface m-auto mx-auto max-w-5xl p-10">
        <h1 className="font-heading text-4xl">Events temporarily unavailable</h1>
        <p className="mt-4">We couldn’t load upcoming events. Please try again shortly.</p>
        <p className="mt-3 text-sm">{diagnosticReference(failure).trim()}</p>
      </main>
    );
  }
  let event: RsvpEvent | undefined;
  if (requested === undefined) {
    event = events[0];
  } else if (typeof requested === "string") {
    event = events.find((item) => item.slug === requested);
  }

  let content = <EventClosed selectedEventUnavailable={requested !== undefined} />;
  if (event?.admission_mode === "ticketed" && event.sales_closed) {
    content = <TicketResult kind="closed" event={event} />;
  } else if (event?.open && event.admission_mode === "ticketed") {
    content = (
      <TicketPurchaseForm
        key={event.slug}
        slug={event.slug}
        event={event}
        initializeAction={initializeTicket.bind(null, event.slug)}
        checkSalesAction={checkTicketSales.bind(null, event.slug)}
        priceCents={event.price_cents!}
        currency={event.currency!}
        ticketType={event.ticket_type_name!}
        returnUrl={ticketReturnUrl()}
        hero={<EventHero event={event} cta={<TicketCta />} />}
        aside={<BrandPanel />}
      />
    );
  } else if (event?.open) {
    content = (
      <RsvpExperience
        key={event.slug}
        submitAction={submitRsvp.bind(null, event.slug)}
        disclaimerVersion={event.disclaimer_version}
        hero={<EventHero event={event} />}
        aside={<BrandPanel />}
        success={<RsvpResult kind="success" event={event} />}
        duplicate={<RsvpResult kind="duplicate" event={event} />}
      />
    );
  }

  return (
    <div data-payment-page className={`paper-surface mx-auto w-full overflow-clip border-x border-[#8b572e45] shadow-[0_0_60px_#35271935] ${!event ? "flex min-h-dvh flex-col" : ""}`}>
      <a href="#main" className="bg-surface absolute -top-25 left-4 z-30 px-5 py-3">
        Skip to content
      </a>
      <SiteHeader ticketed={event?.admission_mode === "ticketed"} />
      <main id="main" className={!event ? "flex flex-1 items-center justify-center" : undefined}>{content}</main>
      <SiteFooter />
    </div>
  );
}
