"use client";
import { QRCodeSVG } from "qrcode.react";
import type { TicketDisplay } from "@/lib/tickets/types";
import EventDetails from "@/components/event/EventDetails";

export default function TicketCard({ ticket }: { ticket: TicketDisplay }) {
  return (
    <div className="text-navy mt-6 space-y-4 text-center">
      <p className="font-heading text-2xl tracking-wide uppercase">El Solar Timbero</p>
      <h2 className="font-heading text-3xl">{ticket.event_name}</h2>
      <EventDetails event={{
        event_date: ticket.event_date,
        starts_at: ticket.starts_at,
        ends_at: ticket.ends_at,
        timezone: ticket.timezone,
        venue_name: ticket.venue_name,
        venue_address: ticket.venue_address,
        admission_mode: "ticketed",
        price_cents: ticket.amount_cents,
        currency: ticket.currency,
      }} variant="result" fullDate={false} />
      <p>{ticket.ticket_type}</p>

      <p>Present this QR code at the door.</p>
      <p>Each ticket is valid for one admission.</p>
      <p>Save or screenshot your ticket.</p>
      <a href={ticket.ticket_url} aria-label="Open your ticket" className="mx-auto block w-full max-w-70">
        <QRCodeSVG
          value={ticket.ticket_url} size={280} level="M" marginSize={4}
          bgColor="#ffffff" fgColor="#000000" role="img" aria-label="Ticket QR code"
          title="Your admission ticket QR code"
          style={{ width: "100%", height: "auto" }}
        />
      </a>
      <p className="font-heading text-3xl tracking-wider">{ticket.ticket_code}</p>
    </div>
  );
}
