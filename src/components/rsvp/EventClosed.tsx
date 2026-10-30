import Link from "next/link";

export default function EventClosed({ selectedEventUnavailable = false }: { selectedEventUnavailable?: boolean }) {
  return (
    <section className="w-full px-6 py-20 text-center mobile:py-8" aria-labelledby="rsvp-title">
      <h1 id="rsvp-title" className="font-heading text-navy text-5xl">
        {selectedEventUnavailable ? "This event is no longer available" : "No events are currently open."}
      </h1>
      <p className="mt-5 text-lg">Check back soon for upcoming El Solar Timbero events.</p>
      {selectedEventUnavailable && (
        <Link href="/" className="mt-5 inline-block underline">
          View available events
        </Link>
      )}
    </section>
  );
}
