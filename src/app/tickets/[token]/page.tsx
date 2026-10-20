import { notFound } from "next/navigation";
import TicketCard from "@/components/tickets/TicketCard";
import { readTicket, ticketFailure } from "@/lib/tickets/server";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your ticket — El Solar Timbero",
  description: "Your individual El Solar Timbero admission ticket.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let ticket;
  try {
    ticket = await readTicket(token);
  } catch (error) {
    ticketFailure("ticket.read", error);
    return (
      <main className="paper-surface mx-auto max-w-3xl px-6 py-12 text-center">
        <h1 className="font-heading text-navy text-4xl">Your ticket is temporarily unavailable.</h1>
        <p className="mt-4">Please refresh or contact @el_solar_timbero for help.</p>
      </main>
    );
  }
  if (!ticket) notFound();
  return (
    <main className="paper-surface mx-auto w-full max-w-3xl px-6 py-12 text-center">
      <h1 className="font-heading text-navy text-5xl">You’re in!</h1>
      <TicketCard ticket={ticket} />
    </main>
  );
}
