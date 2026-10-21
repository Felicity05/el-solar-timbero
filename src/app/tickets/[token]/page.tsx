import { notFound } from "next/navigation";
import TicketResult from "@/components/tickets/TicketResult";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import { readTicket, ticketFailure } from "@/lib/tickets/server";
import TicketCard from "@/components/tickets/TicketCard";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your ticket — El Solar Timbero",
  description: "Your individual El Solar Timbero admission ticket.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function TicketPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ view: string | string[]; status?: string | string[] }> }) {
  const { token } = await params;
  const { view, status } = await searchParams;
  const cardOnly = view === "card";
  const duplicate = status === "duplicate";

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

  if (cardOnly) {
    return (
      <main className="paper-surface flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-3xl">
          <TicketCard ticket={ticket} />
        </div>
      </main>
    );
  }

  return (
    <div className="paper-surface mx-auto w-full overflow-clip border-x border-[#8b572e45] shadow-[0_0_60px_#35271935]">
      <SiteHeader ticketed />
      <main>
        <TicketResult kind={duplicate ? "duplicate" : "success"} ticket={ticket} />
      </main>
      <SiteFooter />
    </div>
  );
}
