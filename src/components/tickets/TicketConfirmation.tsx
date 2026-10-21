"use client";
import { useEffect } from "react";
import type { RsvpEvent } from "@/lib/rsvp/rsvp-event";
import TicketResult from "./TicketResult";
import PaymentProcessingOverlay from "./PaymentProcessingOverlay";
import { useTicketPurchase } from "./useTicketPurchase";
import { useRouter } from "next/navigation";

export default function TicketConfirmation({
  slug,
  paymentReceived = false,
  alreadyPurchased = false,
  event,
}: {
  slug: string;
  paymentReceived?: boolean;
  alreadyPurchased?: boolean;
  event?: RsvpEvent;
}) {
  const router = useRouter();
  const { purchase, finished, retry } = useTicketPurchase(slug, true, alreadyPurchased);

  useEffect(() => {
    if (window.location.pathname === "/ticket/return") {
      window.history.replaceState({}, "", `/ticket/return?event=${encodeURIComponent(slug)}`);
    }
  }, [slug]);

  const ready = purchase?.status === "paid" && purchase.ticket_status === "valid" && purchase.ticket_code && purchase.ticket_url;

  useEffect(() => {
    if (!ready || !purchase?.ticket_url) return;

    const url = new URL(purchase.ticket_url);
    if (alreadyPurchased) {
      url.searchParams.set("status", "duplicate");
    }
    router.replace(`${url.pathname}${url.search}`);
  }, [alreadyPurchased, ready, purchase?.ticket_url, router]);

  if (ready) {
    return (
      <>
        <div className="paper-surface min-h-screen" aria-hidden="true" />
        <PaymentProcessingOverlay stage="ready" />
      </>
    );
  }

  if (alreadyPurchased && !finished) {
    return (
      <>
        <div className="paper-surface min-h-screen" aria-hidden="true" />
        <PaymentProcessingOverlay stage={purchase?.status === "paid" ? "preparing" : "confirming"} stalled={finished} onRetryAction={retry} />
      </>
    );
  }

  //already purchased but browser cached cleaned
  if (alreadyPurchased && finished) {
    return (
      <TicketResult
        kind="duplicate"
        event={event}
        message="We found an existing ticket for your details, but couldn’t open it from this browser.
        Please check your email, use your saved ticket link or contact @el_solar_timbero for help. Don't purchase again"
      />
    );
  }

  if (purchase && purchase.status !== "pending" && purchase.status !== "paid") {
    return <TicketResult kind="unavailable" event={event} />;
  }

  return (
    <>
      <div className="paper-surface min-h-screen" aria-hidden="true" />
      <PaymentProcessingOverlay stage={paymentReceived || purchase?.status === "paid" ? "preparing" : "confirming"} stalled={finished} onRetryAction={retry} />
    </>
  );
}
