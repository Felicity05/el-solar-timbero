import Link from "next/link";
import { requireAdmin } from "../../../../lib/admin/auth";
import { adminRpc } from "../../../../lib/admin/database";
import { timezoneOptions, type AdminFormOptions } from "../../../../lib/admin/events";
import EventForm from "../../../../components/admin/EventForm";
export default async function NewEventPage() {
  await requireAdmin();
  const options = (await adminRpc("admin_event_form_options")) as AdminFormOptions;
  return (
    <div className="space-y-6">
      <Link href="/admin" className="underline">
        Back to Events
      </Link>
      <h1 className="font-heading text-4xl">Create Event</h1>
      <EventForm options={{ ...options, timezones: timezoneOptions() }} now={new Date().toISOString()} />
    </div>
  );
}
