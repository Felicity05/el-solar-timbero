import Link from "next/link";
import { currentAdmin } from "@/lib/admin/auth";
import { adminRpc } from "@/lib/admin/database";
import { groupAdminEvents, type AdminEvent } from "@/lib/admin/events";
import LoginForm from "../../components/admin/LoginForm";
import { DuplicateEventButton } from "@/components/admin/EventControls";
import { logoutAdmin } from "./actions";

export default async function AdminPage() {
  let user;
  try {
    user = await currentAdmin();
  } catch {
    return (
      <section>
        <h1 className="font-heading text-4xl">Admin setup required</h1>
        <p>Configure Supabase Auth and the single admin user ID on the server.</p>
      </section>
    );
  }

  if (!user) return <LoginForm />;

  const events = (await adminRpc("admin_list_events")) as AdminEvent[];
  const { upcoming, past } = groupAdminEvents(events, new Date().toISOString());

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-4xl">Manage All Events</h1>
        <div className="flex items-center gap-5">
          <Link href="/admin/events/new" className="border-navy cursor-pointer rounded border px-4 py-3 font-semibold">
            Create Event
          </Link>
          <form action={logoutAdmin}>
            <button className="text-primary-hover cursor-pointer font-semibold underline">Sign Out</button>
          </form>
        </div>
      </header>
      {!events.length && <p>No events yet. Create your first event.</p>}
      {[
        { title: "Upcoming Events", items: upcoming },
        { title: "Past Events", items: past },
      ]
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.title} aria-label={group.title} className="space-y-5">
            <div className="flex items-center gap-4">
              <hr className="border-border flex-1 border" />
              <h2 className="font-heading text-3xl">{group.title}</h2>
              <hr className="border-border flex-1 border" />
            </div>
            {group.items.map((event) => (
              <article key={event.id} className="border-border bg-surface space-y-3 rounded-lg border p-5">
                <h3 className="font-heading text-3xl">
                  <Link className="underline" href={`/admin/events/${event.id}`}>
                    {event.name}
                  </Link>
                </h3>
                <p>
                  {event.event_date} · {event.admission_mode} · {event.display_status ?? event.status}
                </p>
                <p className="text-sm">
                  Publish at: {new Intl.DateTimeFormat("en-US", { timeZone: event.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(event.publish_at))} ({event.timezone})
                </p>
                <DuplicateEventButton id={event.id} />
              </article>
            ))}
          </section>
        ))}
    </div>
  );
}
