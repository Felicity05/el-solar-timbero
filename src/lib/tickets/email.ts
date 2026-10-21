import "server-only";
import nodemailer, { type SendMailOptions } from "nodemailer";
import QRCode from "qrcode";
import { z } from "zod";
import { ticketRpc, ticketFailure } from "./server";
import { ticketUrl } from "./config";

const emailTicketSchema = z.object({
  recipient: z.email(),
  ticket_token: z.string().regex(/^[a-f0-9]{64}$/),
  ticket_code: z.string(),
  event_name: z.string(),
  event_date: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  timezone: z.string(),
  venue_name: z.string(),
  venue_address: z.string(),
  ticket_type: z.string(),
  amount_cents: z.number().int().positive(),
  currency: z.literal("usd"),
});
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export async function ticketEmailMessage(input: unknown, from: string | { name: string; address: string }): Promise<SendMailOptions> {
  const ticket = emailTicketSchema.parse(input);
  // The very same canonical URL/token used by the website, never another credential.
  const url = `${ticketUrl(ticket.ticket_token)}?view=card`;
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${ticket.event_date}T12:00:00Z`));
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: ticket.timezone });
  const hours = `${time.format(new Date(ticket.starts_at))} – ${time.format(new Date(ticket.ends_at))}`;
  const price = new Intl.NumberFormat("en-US", { style: "currency", currency: ticket.currency, maximumFractionDigits: 0 }).format(ticket.amount_cents / 100);
  const details = [ticket.event_name, date, hours, ticket.venue_name, ticket.venue_address, `${ticket.ticket_type} · ${price}`, `Ticket code: ${ticket.ticket_code}`];
  return {
    from: typeof from === "string" ? { name: "El Solar Timbero", address: from } : from,
    to: { address: ticket.recipient, name: "" },
    subject: "Your El Solar Timbero Ticket 🎟️",
    text: [
      "El Solar Timbero",
      "You're in! Your ticket purchase is confirmed.",
      ...details,
      "Present this QR code at the door.",
      "Each ticket is valid for one admission.",
      "Save this email or screenshot your ticket.",
      "All ticket sales are final and non-refundable.",
      `Open your ticket: ${url}`,
    ].join("\n\n"),
    html: `<div style="background:#f6efdf;color:#182c3a;padding:28px;font-family:Georgia,serif;text-align:center;max-width:600px;margin:auto;border:1px solid #9a8266">
<h1 style="color:#a52a2a">El Solar Timbero</h1><h2>You're in!</h2><p>Your ticket purchase is confirmed.</p>
${details.map((detail) => `<p>${escapeHtml(detail)}</p>`).join("\n")}
<img src="cid:ticket-qr@elsolartimbero" width="280" height="280" alt="Your ticket QR code" style="display:block;width:100%;max-width:280px;height:auto;margin:24px auto;background:white" />
<p>Present this QR code at the door.</p><p>Each ticket is valid for one admission.</p><p>Save this email or screenshot your ticket.</p>
<p><a style="color:#a52a2a" href="${escapeHtml(url)}">Open your ticket</a></p><p><strong>All ticket sales are final and non-refundable.</strong></p></div>`,
    attachments: [
      {
        filename: "el-solar-ticket-qr.png",
        content: await QRCode.toBuffer(url, { type: "png", width: 560, margin: 4, errorCorrectionLevel: "M" }),
        contentType: "image/png",
        cid: "ticket-qr@elsolartimbero",
        contentDisposition: "inline",
      },
    ],
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export function ticketEmailFrom(user: string, configured?: string) {
  const address = z.email().parse(user);
  const value = configured?.trim();
  if (!value) {
    return { name: "El Solar Timbero", address };
  }
  if (/[\r\n]/.test(value)) {
    throw new Error("Invalid email sender");
  }
  if (z.email().safeParse(value).success) {
    return { name: "El Solar Timbero", address: value };
  }
  const named = value.match(/^([^<>]+)<([^<>]+)>$/);
  if (named) {
    return { name: named[1].trim(), address: z.email().parse(named[2].trim()) };
  }
  if (/[<>@]/.test(value)) {
    throw new Error("Invalid email sender");
  }
  return { name: value, address };
}

export function gmailSender() {
  const user = z.email().parse(process.env.GMAIL_USER?.trim());
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!pass) {
    throw new Error("Gmail App Password missing");
  }
  const from = ticketEmailFrom(user, process.env.TICKET_EMAIL_FROM);
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    logger: false,
    debug: false,
  });
  return { from, send: (message: SendMailOptions) => transport.sendMail(message) };
}

// Invoked only after verified, committed webhook fulfillment. SMTP is deliberately
// outside the payment transaction. No automatic claim expiry/retry after ambiguity.
export async function deliverTicketEmail(orderId: string, intentId: string, sender = gmailSender) {
  let operation = "email.configuration";
  try {
    const { from, send } = sender(); // Missing configuration does not consume a claim.
    operation = "email.claim";
    const ticket = await ticketRpc("claim_ticket_email", { p_order_id: orderId, p_intent_id: intentId });
    if (!ticket) {
      return;
    }
    operation = "email.send";
    const result = await send(await ticketEmailMessage(ticket, from));
    if (!result.accepted?.length || result.rejected?.length) {
      throw new Error("SMTP did not accept recipient");
    }
    operation = "email.record";
    if ((await ticketRpc("mark_ticket_email_sent", { p_order_id: orderId })) !== true) {
      throw new Error("Email acceptance not recorded");
    }
  } catch (error) {
    // Never log SMTP error messages: they may contain recipient/credentials.
    ticketFailure(operation, error);
  }
}
