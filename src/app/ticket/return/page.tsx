import TicketConfirmation from "@/components/tickets/TicketConfirmation";
export const metadata = {
  title: "Your ticket — El Solar Timbero",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function TicketReturn({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const slug = (await searchParams).event;
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return <main className="p-10">This confirmation link is incomplete. Return to the event page or contact us.</main>;
  return (
    <main data-payment-page>
      <TicketConfirmation slug={slug} />
    </main>
  );
}
