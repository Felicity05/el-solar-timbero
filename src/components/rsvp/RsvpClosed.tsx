import Link from "next/link";

export default function RsvpClosed({ selectedEventUnavailable = false }: { selectedEventUnavailable?: boolean }) {
  return <section className="px-6 py-20 text-center" aria-labelledby="rsvp-title">
    <h1 id="rsvp-title" className="font-heading text-5xl text-navy">
      {selectedEventUnavailable ? "This event is no longer available for RSVP" : "No events are currently open for RSVP"}
    </h1>
    <p className="mt-5 text-lg">Check back soon for upcoming El Solar Timbero events.</p>
    {selectedEventUnavailable && <Link href="/" className="mt-5 inline-block underline">View available events</Link>}
  </section>;
}
