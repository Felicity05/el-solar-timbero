import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { adminRpc } from "./database";
import { requireAdmin } from "./auth";
import { deliverTicketEmail } from "../tickets/email";
import { ticketPath } from "../tickets/config";
import { cleanupExpiredReservations } from "../tickets/reservations";
import type { AdminDetail } from "./events";

const resultSchema = z.object({ status: z.enum(["issued", "already_issued"]), order_id: z.uuid(), ticket_code: z.string(), ticket_token: z.string().regex(/^[a-f0-9]{64}$/) });
export async function issueComplimentary(id: string, buyer: { name: string; email: string; phone: string }) {
  const user = await requireAdmin();
  const detail = (await adminRpc("admin_event_detail", { p_event_id: id })) as AdminDetail | null;
  if (!detail) return { error: "Event not found." };
  if (detail.event.ticket_capacity) await cleanupExpiredReservations(detail.event.slug);
  const result = await adminRpc("admin_issue_complimentary_ticket", {
    p_event_id: id,
    p_name: buyer.name,
    p_email: buyer.email,
    p_phone: buyer.phone,
    p_issued_by: user.id,
    p_access_hash: randomBytes(32).toString("hex"),
    p_ticket_token: randomBytes(32).toString("hex"),
    p_ticket_code: `EST-${randomBytes(6).toString("hex").toUpperCase()}`,
  });
  if (result?.status === "capacity_full") return { error: "The event has no remaining tickets. Issued tickets and active checkout reservations count toward the limit." };
  if (result?.status === "purchase_in_progress") return { error: "This person already has an unpaid checkout. Finish it, or wait for its reservation to expire before issuing a free ticket." };
  if (result?.status === "unavailable" || result?.status === "invalid_input") return { error: "A complimentary ticket cannot be issued. Check the event and attendee details." };
  const ticket = resultSchema.parse(result);
  const email = ticket.status === "issued" ? await deliverTicketEmail(ticket.order_id, null) : "already_attempted";
  return { ticketCode: ticket.ticket_code, ticketUrl: ticketPath(ticket.ticket_token), alreadyIssued: ticket.status === "already_issued", email };
}
