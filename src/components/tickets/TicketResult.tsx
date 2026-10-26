"use client";
import { useEffect } from "react";
import Link from "next/link";
import type { RsvpEvent } from "@/lib/rsvp/rsvp-event";
import type { TicketDisplay } from "@/lib/tickets/types";
import EventResultLayout from "@/components/event/EventResultLayout";
import EventResultCard from "@/components/event/EventResultCard";
import TicketCard from "./TicketCard";

type TicketResultProps = {
  kind: "success" | "duplicate" | "closed" | "unavailable";
  ticket?: TicketDisplay;
  event?: RsvpEvent;
  message?: string;
};

export default function TicketResult({ kind, ticket, event, message }: TicketResultProps) {
  useEffect(() => {
    document.getElementById("result-title")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [kind]);

  let title = (
    <>
      <span className="print-ink-text text-navy">You&apos;re</span>
      <br />
      <span className="print-ink-text text-primary">in!</span>
    </>
  );
  let subtitle = "Your ticket has been confirmed.";
  let description = "¡Nos vemos en El Solar!";

  if (kind === "duplicate") {
    title = (
      <>
        <span className="print-ink-text text-navy">You already have</span>
        <br />
        <span className="print-ink-text text-primary">a ticket!</span>
      </>
    );
    subtitle = "You're already on the list. ¡Nos vemos en El Solar!";
    description = message ?? "Your existing ticket is shown below.";
  } else if (kind === "closed") {
    title = (
      <>
        <span className="print-ink-text text-navy">Sales are now closed</span>
        <br />
        <span className="print-ink-text text-primary">for this event</span>
      </>
    );
    subtitle = "You can still come and pay at the door!";
    description = "See you tonight at El Solar!";
  } else if (kind === "unavailable") {
    title = (
      <>
        <span className="print-ink-text text-navy">Ticket</span>
        <br />
        <span className="print-ink-text text-primary">unavailable</span>
      </>
    );
    subtitle = "We couldn’t display your ticket.";
    description = message ?? "Please check your saved confirmation or contact @el_solar_timbero for help.";
  }

  return (
    <EventResultLayout title={title} subtitle={subtitle} description={<p className="mobile:text-[16px] mx-auto max-w-115 text-[18px] leading-[1.4]">{description}</p>}>
      {ticket && <TicketCard ticket={ticket} />}
      {!ticket && event && <EventResultCard name={event.name} event={event} showAdmission={kind !== "closed"} />}
      {kind !== "closed" && (
        <Link
          className="print-brush font-heading text-surface mobile:min-w-60 mobile:text-[25px] mt-6.75 inline-flex min-h-15 min-w-67.5 items-center justify-center px-6 pt-3.25 pb-3.75 text-[30px] uppercase"
          href="/"
        >
          Back to home
        </Link>
      )}
    </EventResultLayout>
  );
}
