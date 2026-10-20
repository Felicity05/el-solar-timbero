"use client";
import { useEffect, useState } from "react";
import { ticketStatus } from "@/app/ticket-actions";
import type { PurchaseStatus } from "@/lib/tickets/types";
import TicketCard from "./TicketCard";
import EventDetails from "@/components/event/EventDetails";
import type { RsvpEvent } from "@/lib/rsvp/rsvp-event";
import { existingCredential } from "./credential";

export default function TicketConfirmation({ slug, paymentReceived = false, alreadyPurchased = false, event }: { slug: string; paymentReceived?: boolean; alreadyPurchased?: boolean; event?: RsvpEvent }) {
  const [purchase, setPurchase] = useState<PurchaseStatus | null>(null);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    // Stripe may append a client secret to its return URL. Remove it immediately;
    // confirmation is authorized with our credential, never URL payment status.
    if (window.location.pathname === "/ticket/return") {
      window.history.replaceState({}, "", `/ticket/return?event=${encodeURIComponent(slug)}`);
    }
    async function poll() {
      const credential = existingCredential(slug);
      if (!credential) {
        setFinished(true);
        return;
      }
      const result = await ticketStatus(slug, credential);
      if (canceled) return;
      if (result) setPurchase(result);
      if (!result && alreadyPurchased) {
        setFinished(true);
        return;
      }
      if ((result?.ticket_code && result.ticket_url) || (result && ["refunded", "void"].includes(result.status)) || ++attempts >= 15) {
        setFinished(true);
        return;
      }
      timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [slug, alreadyPurchased]);
  const ready = purchase?.status === "paid" && purchase.ticket_status === "valid" && purchase.ticket_code && purchase.ticket_url;
  let title = "We're checking your payment.";
  if (alreadyPurchased) title = "You already have a ticket for this event.";
  else if (ready) title = "You're in!";
  else if (purchase && ["refunded", "void"].includes(purchase.status)) title = "This ticket is no longer valid.";
  else if (paymentReceived || purchase?.status === "paid") title = "Payment received — we're preparing your ticket.";
  let message = "Please keep this page open while we confirm your ticket.";
  if (finished && alreadyPurchased && !purchase) message = "Use your saved confirmation or the original purchase tab to view your ticket. For help, contact @el_solar_timbero.";
  else if (finished) message = "Refresh to check again. If you paid, please don’t pay again. Contact @el_solar_timbero if you need help.";
  return (
    <section className="paper-surface mx-auto max-w-3xl px-6 py-12 text-center" aria-live="polite">
      <h1 className="font-heading text-navy text-5xl">
        {title}
      </h1>
      {ready && (
        <TicketCard
          ticket={{
            ...purchase,
            ticket_code: purchase.ticket_code!,
            ticket_url: purchase.ticket_url!,
          }}
        />
      )}
      {!ready && event && <div className="mt-6 space-y-4">
        <h2 className="font-heading text-3xl text-navy">{event.name}</h2>
        <EventDetails event={event} variant="result" fullDate={false} />
      </div>}
      {!ready && (
        <p className="mt-6">
          {message}
        </p>
      )}
      <a className="mt-6 inline-block underline" href={`/?event=${encodeURIComponent(slug)}`}>
        Back to event
      </a>
    </section>
  );
}
