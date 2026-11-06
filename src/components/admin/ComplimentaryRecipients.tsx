import type { ComplimentaryRecipient } from "@/lib/admin/events";
export default function ComplimentaryRecipients({ recipients, timezone }: { recipients: ComplimentaryRecipient[]; timezone: string }) {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" });
  return (
    <fieldset className="border-border min-w-0 space-y-4 rounded-lg border-2 p-5">
      <legend className="font-heading m-0 px-2 text-3xl">Complimentary recipients</legend>
      {!recipients.length ? (
        <p>No complimentary tickets issued for this event yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">People issued complimentary tickets for this event</caption>
            <thead>
              <tr>
                {["Name", "Email", "Phone", "Ticket code", "Ticket status", "Email status", "Checked in at", "Issued"].map((label) => (
                  <th key={label} scope="col" className="border-border border-b px-3 py-2 whitespace-nowrap">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recipients.map((recipient) => {
                let emailStatus = "Pending";
                if (recipient.email_sent_at) emailStatus = "Sent";
                else if (recipient.email_attempted_at) emailStatus = "Not confirmed";
                return (
                  <tr key={recipient.ticket_code} className="border-border border-b">
                    <td className="px-3 py-3">{recipient.name}</td>
                    <td className="px-3 py-3">{recipient.email}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{recipient.phone}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{recipient.ticket_code}</td>
                    <td className="px-3 py-3 capitalize">{recipient.status}</td>
                    <td className="px-3 py-3">{emailStatus}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{recipient.checked_in_at ? date.format(new Date(recipient.checked_in_at)) : "Not checked in"}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{date.format(new Date(recipient.issued_at))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </fieldset>
  );
}
