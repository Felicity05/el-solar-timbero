"use client";
import { useActionState, useState, type ChangeEvent } from "react";
import { issueComplimentaryTicket, type ComplimentaryActionState } from "@/app/admin/actions";
import { controlClassName, labelClassName } from "../shared/form-styles";
export default function ComplimentaryTicketForm({ eventId }: { eventId: string }) {
  const [fields, setFields] = useState({ name: "", email: "", phone: "" });
  const [state, action, pending] = useActionState(async (previous: ComplimentaryActionState, data: FormData) => {
    const result = await issueComplimentaryTicket(eventId, previous, data);
    if (result.ticketCode && !result.alreadyIssued) setFields({ name: "", email: "", phone: "" });
    return result;
  }, {});
  const complete = Object.values(fields).every((value) => value.trim().length > 0);
  function change(event: ChangeEvent<HTMLInputElement>) {
    setFields((current) => ({ ...current, [event.target.name]: event.target.value }));
  }
  let message = "Ticket issued. Email delivery could not be confirmed; share the ticket link below.";
  if (state.alreadyIssued) message = "This person already has a ticket. No new ticket or email was created.";
  else if (state.email === "sent") message = "Complimentary ticket issued and email sent.";
  return (
    <fieldset disabled={pending} className="border-border space-y-4 rounded-lg border-2 p-5">
      <legend className="font-heading m-0 px-2 text-3xl">Issue complimentary ticket</legend>
      <p>One free ticket per person for this event. Complimentary tickets count toward the event limit and are emailed with their existing ticket link and QR.</p>
      <form action={action} onReset={(event) => event.preventDefault()} className="space-y-4">
        <label className={labelClassName}>
          Attendee name
          <input value={fields.name} onChange={change} name="name" required maxLength={100} className={controlClassName} />
        </label>
        <label className={labelClassName}>
          Attendee email
          <input value={fields.email} onChange={change} name="email" type="email" required maxLength={254} className={controlClassName} />
        </label>
        <label className={labelClassName}>
          Attendee phone
          <input value={fields.phone} onChange={change} name="phone" type="tel" required maxLength={40} className={controlClassName} />
        </label>
        <button disabled={pending || !complete} className="border-navy mt-3 cursor-pointer rounded border px-4 py-3 font-semibold disabled:opacity-50">
          {pending ? "Issuing ticket…" : "Issue free ticket & email"}
        </button>
        {state.error && (
          <p role="alert" className="text-primary">
            {state.error}
          </p>
        )}
        {state.ticketCode && (
          <div role="status" className="space-y-2">
            <p>{message}</p>
            <p>Ticket code: {state.ticketCode}</p>
            <a href={state.ticketUrl} className="underline" target="_blank" rel="noreferrer">
              Open ticket
            </a>
          </div>
        )}
      </form>
    </fieldset>
  );
}
