"use client";
export default function TicketCta() {
  return (
      <button type="button" className="print-brush mt-6 px-8 py-4 font-heading text-3xl text-surface cursor-pointer"
        onClick={() => {
      const section = document.getElementById("ticket-purchase");
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
      section?.querySelector<HTMLInputElement>("input:not([tabindex='-1'])")?.focus({ preventScroll: true });
    }}>Get Ticket</button>
  );
}
