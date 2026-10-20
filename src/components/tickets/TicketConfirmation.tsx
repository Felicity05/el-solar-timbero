"use client";
import { useEffect, useState } from "react";
import { ticketStatus } from "@/app/ticket-actions";
import type { PurchaseStatus } from "@/lib/tickets/types";
import { existingCredential } from "./credential";

export default function TicketConfirmation({ slug, paymentReceived = false, alreadyPurchased = false }: { slug: string; paymentReceived?: boolean; alreadyPurchased?: boolean }) {
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
      if (!credential) { setFinished(true); return; }
      const result = await ticketStatus(slug, credential);
      if (canceled) return;
      if (result) setPurchase(result);
      if (!result && alreadyPurchased) { setFinished(true); return; }
      if (result?.ticket_code || (result && result.status !== "pending") || ++attempts >= 15) {
        setFinished(true); return;
      }
      timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { canceled = true; clearTimeout(timer); };
  }, [slug, alreadyPurchased]);
  if (finished && alreadyPurchased && !purchase) return <p className="mt-6 text-center">Use your saved confirmation or the original purchase tab to view your ticket. For help, contact @el_solar_timbero.</p>;
  const ready = purchase?.status === "paid" && purchase.ticket_status === "valid" && purchase.ticket_code;
  return <section className="paper-surface mx-auto max-w-3xl px-6 py-12 text-center" aria-live="polite">
    <h1 className="font-heading text-5xl text-navy">{ready ? "You're in!" : purchase && ["refunded", "void"].includes(purchase.status)
      ? "This ticket is no longer valid." : paymentReceived || purchase?.status === "paid"
      ? "Payment received — we're preparing your ticket." : "We're checking your payment."}</h1>
    {ready && <div className="mt-6 space-y-3">
      <h2 className="font-heading text-3xl">{purchase.event_name}</h2>
      <p>{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: purchase.timezone }).format(new Date(purchase.starts_at))}</p>
      <p>{purchase.venue_name}<br />{purchase.venue_address}</p>
      <p>{purchase.ticket_type} — {new Intl.NumberFormat("en-US", { style: "currency", currency: purchase.currency }).format(purchase.amount_cents / 100)}</p>
      <p className="font-heading text-3xl tracking-wider">{purchase.ticket_code}</p>
      <p>Save or screenshot this confirmation and bring it with you.</p>
    </div>}
    {!ready && <p className="mt-6">{finished
      ? "Refresh to check again. If you paid, please don’t pay again. Contact @el_solar_timbero if you need help."
      : "Please keep this page open while we confirm your ticket."}</p>}
    <a className="mt-6 inline-block underline" href={`/?event=${encodeURIComponent(slug)}`}>Back to event</a>
  </section>;
}
