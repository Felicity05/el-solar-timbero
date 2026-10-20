"use client";
export default function TicketCta() {
  return (
    <button
      type="button"
      className="print-brush font-heading text-surface mt-6 cursor-pointer px-8 py-4 text-3xl"
      onClick={() => {
        const section = document.getElementById("ticket-purchase");
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
        section?.querySelector<HTMLInputElement>("input:not([tabindex='-1'])")?.focus({ preventScroll: true });
      }}
    >
      Get Ticket
    </button>
  );
}
