export type TicketSession =
  | { status: "ready"; clientSecret: string; amountCents: number; currency: string }
  | { status: "already_purchased" }
  | { status: "checking" }
  | { status: "processing"; paymentReceived: boolean }
  | { status: "error"; message: string };
export type PurchaseStatus = {
  status: "pending" | "paid" | "refunded" | "void";
  ticket_code: string | null; ticket_status: string | null;
  event_name: string; event_date: string; starts_at: string; ends_at: string;
  timezone: string; venue_name: string; venue_address: string;
  ticket_type: string; amount_cents: number; currency: string;
};
