"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};
export type PaymentStage = "confirming" | "received" | "preparing" | "ready";
const steps = ["Processing payment…", "Payment received", "Preparing your ticket…", "Ticket ready"];

export default function PaymentProcessingOverlay({ stage, stalled = false, onRetryAction }: { stage: PaymentStage; stalled?: boolean; onRetryAction?: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const node = dialog.current;
    const page = document.querySelector<HTMLElement>("[data-payment-page]");
    const wasInert = page?.inert ?? false;
    const focus = document.activeElement as HTMLElement | null;

    if (page) page.inert = true;

    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.focus();
    return () => {
      if (page) {
        page.inert = wasInert;
      }
      document.body.style.overflow = overflow;
      focus?.focus();
    };
  }, [mounted]);

  const active = ["confirming", "received", "preparing", "ready"].indexOf(stage);

  if (!mounted) return null;

  return createPortal(
    <div className="bg-navy/75 fixed inset-0 z-50 flex items-center justify-center p-4">
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
          }
          if (event.key === "Tab") {
            const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
            if (!buttons?.length) {
              event.preventDefault();
              return;
            }
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
        aria-labelledby="payment-processing-title"
        aria-describedby="payment-processing-description"
        className="paper-surface border-primary text-navy mobile:p-5 w-full max-w-xl rounded-md border-2 p-7 text-center shadow-2xl outline-none"
      >
        <h2 id="payment-processing-title" className="font-heading mobile:text-4xl text-5xl uppercase">
          Processing payment
        </h2>
        <p id="payment-processing-description" className="mt-5 text-lg">
          Please keep this tab open while we confirm your payment and prepare your ticket.
        </p>
        <ol className="my-6 space-y-3 text-left" aria-live="polite" aria-label="Payment status">
          {steps.map((step, index) => (
            <li key={step} aria-current={index === active ? "step" : undefined} className={`flex items-center gap-3 ${index <= active ? "text-navy font-semibold" : "text-muted"}`}>
              <span aria-hidden="true" className="text-primary">
                {index < active || stage === "ready" ? "✓" : "○"}
              </span>
              {step}
            </li>
          ))}
        </ol>
        {stalled && (
          <div role="status" className="border-border border-t pt-4">
            <p>Confirmation is taking longer than usual. Please don’t pay again. You can check again or contact @el_solar_timbero for help.</p>
            <button type="button" onClick={onRetryAction} className="print-brush font-heading text-surface mt-4 px-6 py-3 text-2xl">
              Check again
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
