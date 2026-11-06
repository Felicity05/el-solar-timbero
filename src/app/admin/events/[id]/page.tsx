import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { adminRpc } from "@/lib/admin/database";
import { timezoneOptions, type AdminFormOptions, type AdminDetail, type ComplimentaryRecipient } from "@/lib/admin/events";
import ComplimentaryRecipients from "../../../../components/admin/ComplimentaryRecipients";
import ComplimentaryTicketForm from "../../../../components/admin/ComplimentaryTicketForm";
import EventForm from "../../../../components/admin/EventForm";
import { DuplicateEventButton, EventPinControl } from "@/components/admin/EventControls";

export default async function EventAdminPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = (await adminRpc("admin_event_detail", { p_event_id: id })) as AdminDetail | null;
  if (!detail) notFound();
  const options = (await adminRpc("admin_event_form_options")) as AdminFormOptions;
  const { event, metrics } = detail;
  const recipients = event.admission_mode === "ticketed" ? ((await adminRpc("admin_list_complimentary_recipients", { p_event_id: id })) as ComplimentaryRecipient[]) : [];
  const rate = (metrics.tickets_issued ?? metrics.tickets_sold) ? Math.round((metrics.checked_in / (metrics.tickets_issued ?? metrics.tickets_sold)) * 1000) / 10 : 0;
  const items = [
    ["Tickets sold", metrics.tickets_sold],
    ["Complimentary tickets", metrics.complimentary_tickets ?? 0],
    ["Active checkouts", metrics.pending_reservations ?? 0],
    ["Remaining tickets", metrics.remaining_capacity ?? "Unlimited"],
    ["Gross revenue", new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(metrics.gross_revenue_cents / 100)],
    ["Checked in", metrics.checked_in],
    ["Not checked in", metrics.not_checked_in],
    ["Attendance rate", `${rate}%`],
  ];
  return (
    <div className="space-y-8">
      <Link href="/admin" className="hover:text-accent-gold font-semibold underline">
        <span aria-hidden="true">←</span> Back to Events
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-4xl">Edit Event</h1>
        <h1 className="font-heading text-accent-gold text-4xl text-shadow-sm">Event Date: {event.event_date}</h1>
        <DuplicateEventButton id={id} />
      </header>
      <section className="space-y-4">
        <h2 className="font-heading text-3xl">SALES & ATTENDANCE</h2>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {items.map(([label, value]) => (
            <div key={label} className="border-border bg-surface rounded-lg border p-4">
              <dt>{label}</dt>
              <dd className="font-heading text-3xl">{value}</dd>
            </div>
          ))}
        </dl>
        {event.admission_mode === "rsvp" && <p>RSVPs: {metrics.rsvps}. Door check-in applies to ticketed events.</p>}
      </section>
      {event.admission_mode === "ticketed" && <EventPinControl key={`pin-${id}`} id={id} configured={event.has_check_in_pin} />}
      {event.admission_mode === "ticketed" && <ComplimentaryTicketForm key={`complimentary-${id}`} eventId={id} />}
      {event.admission_mode === "ticketed" && <ComplimentaryRecipients recipients={recipients} timezone={event.timezone} />}
      <EventForm key={`form-${id}`} options={{ ...options, timezones: timezoneOptions() }} detail={detail} now={new Date().toISOString()} />
    </div>
  );
}
