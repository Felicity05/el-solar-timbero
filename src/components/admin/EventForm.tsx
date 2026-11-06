"use client";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { saveAdminEvent } from "../../app/admin/actions";
import { localInput, generatedSlugForEvent, adminPublicationStatus, type AdminDetail, type AdminFormOptions } from "../../lib/admin/events";
import { controlClassName, labelClassName } from "../shared/form-styles";
const subscribeTimezone = () => () => {};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimezone = () => "UTC";

export default function EventForm({ detail, now, options }: { detail?: AdminDetail; now: string; options: AdminFormOptions }) {
  const event = detail?.event,
    ticket = detail?.ticket_type;
  const [mode, setMode] = useState(event?.admission_mode ?? "ticketed");
  const [state, action, pending] = useActionState(saveAdminEvent.bind(null, event?.id ?? null), {});
  const router = useRouter();

  useEffect(() => {
    if (state.eventId) {
      router.push(`/admin/events/${state.eventId}`);
      router.refresh();
    }
  }, [state.eventId, router]);

  const localTimezone = useSyncExternalStore(subscribeTimezone, browserTimezone, serverTimezone);
  const [chosenTimezone, setTimezone] = useState<string | null>(null);
  const timezone = chosenTimezone ?? event?.timezone ?? localTimezone;
  const [name, setName] = useState(event?.name ?? "");
  const [chosenDate, setDate] = useState<string | null>(null);
  const date = chosenDate ?? event?.event_date ?? localInput(now, timezone).slice(0, 10);
  const [status, setStatus] = useState(adminPublicationStatus(event, now));
  const [publishAt, setPublishAt] = useState<string | null>(null);
  const publication = publishAt ?? (event ? localInput(event.publish_at, timezone) : localInput(now, timezone));
  const zones = [...new Set([...(options.timezones ?? []), timezone])].sort();
  const disclaimers = [...new Set([...options.disclaimer_versions, ...(event?.gift_card_disclaimer_version ? [event.gift_card_disclaimer_version] : [])])].sort();
  const ticketNames = [...new Set(["General Admission", ...options.ticket_names, ...(ticket?.name ? [ticket.name] : [])])].sort();

  function field(name: string, label: string, value = "", options: { type?: string; required?: boolean } = {}) {
    const { type = "text", required = false } = options;
    return (
      <label className={labelClassName}>
        {label}
        <input name={name} type={type} defaultValue={value} required={required} className={controlClassName} />
      </label>
    );
  }

  return (
    <form action={action} onReset={(e) => e.preventDefault()} className="space-y-5">
      {state.error && (
        <p role="alert" className="border-primary text-primary border-l-4 p-3">
          {state.error}
        </p>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <label className={labelClassName}>
          Event name
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} required className={controlClassName} />
        </label>
        <label className={labelClassName}>
          Unique event slug
          <input name="slug" value={generatedSlugForEvent(name, date, event)} readOnly className={controlClassName} />
        </label>
        <label className={labelClassName}>
          Event date
          <input name="event_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={controlClassName} />
        </label>
        <label className={labelClassName}>
          Event timezone
          <select name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={controlClassName}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        {field("start_time", "Starts (event timezone)", event ? localInput(event.starts_at, event.timezone).slice(11) : "20:00", { type: "time", required: true })}
        {field("end_time", "Ends (event timezone)", event ? localInput(event.ends_at, event.timezone).slice(11) : "23:30", { type: "time", required: true })}
        {field("venue_name", "Venue", event?.venue_name, { required: true })}
        {field("venue_address", "Venue address", event?.venue_address, { required: true })}
      </div>
      <p className="text-sm">
        Start and end use the selected event date and timezone. An end time at or before the start means the following day. Slugs regenerate automatically when the event date changes.
      </p>
      <label className={labelClassName}>
        Description
        <textarea name="description" defaultValue={event?.description ?? ""} className={controlClassName} rows={3} />
      </label>
      <div className="grid gap-5 md:grid-cols-2">
        <label className={labelClassName}>
          Admission mode
          <select name="admission_mode" value={mode} onChange={(e) => setMode(e.target.value as "rsvp" | "ticketed")} className={controlClassName}>
            <option value="ticketed">Ticketed</option>
            <option value="rsvp">RSVP</option>
          </select>
        </label>
        <label className={labelClassName}>
          Status
          <select
            name="status"
            value={status}
            onChange={(e) => {
              const next = e.target.value as typeof status;
              setStatus(next);
              if (next === "published") setPublishAt(localInput(new Date().toISOString(), timezone));
            }}
            className={controlClassName}
          >
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label className={labelClassName}>
          Publish at (event timezone)
          <input name="publish_at_local" type="datetime-local" value={publication} onChange={(e) => setPublishAt(e.target.value)} required className={controlClassName} />
        </label>
        <label className={labelClassName}>
          Gift-card disclaimer
          <select name="gift_card_disclaimer_version" defaultValue={event?.gift_card_disclaimer_version ?? ""} className={controlClassName}>
            <option value="">No gift-card promotion</option>
            {disclaimers.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm">
        Scheduled events automatically become public at their publication time. Published means the event is public now. Ticketed publication windows cannot overlap. Leave the disclaimer version empty
        for no promotion; a version uses the existing Guantanamera promotion wording.
      </p>
      {mode === "rsvp" ? (
        <label className="block">
          <input type="checkbox" name="rsvp_open" defaultChecked={event?.rsvp_open ?? false} /> RSVP open (requires Scheduled or Published status)
        </label>
      ) : (
        <fieldset className="border-border space-y-5 rounded-lg border-2 p-5">
          <legend className="font-heading m-0 px-2 text-3xl">Ticket configuration</legend>
          <label className={labelClassName}>
            Ticket limit (paid + complimentary)
            <input name="ticket_capacity" type="number" min="1" max="1000000" step="1" defaultValue={event?.ticket_capacity ?? ""} className={controlClassName} />
          </label>
          <p className="text-sm">
            Leave blank for unlimited tickets. Paid and complimentary tickets share this limit. Unpaid checkouts reserve a place for 15 minutes; a place is released only after Stripe cancellation is
            confirmed.
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <label className={labelClassName}>
              Ticket type
              <select name="ticket_name" defaultValue={ticket?.name ?? "General Admission"} className={controlClassName}>
                {ticketNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClassName}>
              Price (USD)
              <input name="price" type="number" min="0.01" step="0.01" defaultValue={((ticket?.price_cents ?? 1000) / 100).toFixed(2)} required className={controlClassName} />
            </label>
            {field("ticket_description", "Ticket description", ticket?.description ?? "")}
            {field("sales_start_local", "Sales start (optional, event timezone)", localInput(ticket?.sales_start_at ?? null, timezone), { type: "datetime-local" })}
            {field("sales_end_local", "Sales end (optional, event timezone)", localInput(ticket?.sales_end_at ?? null, timezone), { type: "datetime-local" })}
          </div>
          <p className="text-sm">The existing database policy caps online sales at 5 PM Eastern on the event date. Earlier configured deadlines and event start still apply.</p>
          <label className="block">
            <input name="ticket_active" type="checkbox" defaultChecked={ticket?.active ?? true} /> Ticket type active
          </label>
          <label className="block">
            <input name="ticket_sales_open" type="checkbox" defaultChecked={event?.ticket_sales_open ?? false} /> Ticket sales open
          </label>
        </fieldset>
      )}
      <button disabled={pending} className="bg-primary text-surface rounded px-6 py-3 font-bold disabled:opacity-50">
        {pending ? "Saving…" : "Save Event"}
      </button>
      {state.eventId && <p role="status">Event saved.</p>}
    </form>
  );
}
