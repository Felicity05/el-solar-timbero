"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateAdminEvent, generateEventPin, revealEventPin } from "@/app/admin/actions";

const buttonClass = "rounded border border-navy px-4 py-3 font-semibold disabled:opacity-50 cursor-pointer";

export function DuplicateEventButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div>
      <button
        className={`${buttonClass} hover:text-accent-gold hover:border-accent-gold`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await duplicateAdminEvent(id);
            if (result.eventId) router.push(`/admin/events/${result.eventId}`);
            else setError(result.error ?? "Unable to duplicate event.");
          })
        }
      >
        {pending ? "Duplicating…" : "Duplicate as Draft"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function EventPinControl({ id, configured }: { id: string; configured: boolean }) {
  const [pending, start] = useTransition();
  const [pin, setPin] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [hasPin, setHasPin] = useState(configured);
  return (
    <fieldset className="border-border space-y-4 rounded-lg border-2 p-5">
      <legend className="font-heading m-0 px-2 text-3xl">Door PIN</legend>
      <p>{hasPin ? "PIN already generated. Show it securely or regenerate it to invalidate existing door sessions." : "Generate a PIN to enable door access for this event."}</p>
      <button
        className={buttonClass}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setPin(null);
            setVisible(false);
            setError("");
            const result = await generateEventPin(id);
            if (result.pin) {
              setPin(result.pin);
              setVisible(true);
              setHasPin(true);
            } else setError(result.error ?? "Unable to generate PIN.");
          })
        }
      >
        {pending ? "Generating…" : (hasPin && "Regenerate PIN") || "Generate PIN"}
      </button>
      {pin && visible && (
        <div role="status" className="space-y-3">
          <p>Share this PIN privately with staff. You can return here and use Show PIN again.</p>
          <code className="block text-3xl font-semibold tracking-widest">{pin}</code>
          <button className="underline" onClick={() => setVisible(false)}>
            Hide PIN
          </button>
        </div>
      )}
      {hasPin && !visible && (
        <button
          className={`${buttonClass} ml-3`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError("");
              const result = await revealEventPin(id);
              if (result.pin) {
                setPin(result.pin);
                setVisible(true);
              } else setError(result.error ?? "Unable to display PIN.");
            })
          }
        >
          Show PIN
        </button>
      )}
      {error && (
        <p role="alert" className="text-primary">
          {error}
        </p>
      )}
    </fieldset>
  );
}
