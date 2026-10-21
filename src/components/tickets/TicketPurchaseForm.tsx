"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { type Appearance, loadStripe } from "@stripe/stripe-js";
import { validateRsvp } from "@/lib/rsvp/rsvp-validation";
import { referralSources } from "@/lib/rsvp/rsvp";
import type { RsvpEvent } from "@/lib/rsvp/rsvp-event";
import type { TicketSession } from "@/lib/tickets/types";
import { controlClassName, labelClassName } from "../shared/form-styles";
import { purchaseCredential } from "./credential";
import TicketConfirmation from "./TicketConfirmation";
import TicketResult from "./TicketResult";
import PaymentProcessingOverlay, { type PaymentStage } from "./PaymentProcessingOverlay";
import { useTicketPurchase } from "./useTicketPurchase";
import { useRouter } from "next/navigation";
import { TicketPayment } from "@/components/tickets/TicketPayment";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = key ? loadStripe(key) : null;
const appearance: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#a52a2a",
    colorBackground: "#f6efdf",
    colorText: "#182c3a",
    colorDanger: "#a52a2a",
    fontFamily: "Georgia, serif",
    fontSizeBase: "16px",
    spacingUnit: "4px",
    borderRadius: "7px",
  },
  rules: {
    ".Input": { border: "1px solid #9a8266", padding: "14px", boxShadow: "none" },
    ".Input:focus": { borderColor: "#182c3a", boxShadow: "0 0 0 2px #182c3a" },
    ".Label": { fontWeight: "bold", color: "#182c3a" },
  },
};

type TicketPurchaseFormProps = {
  slug: string;
  event: RsvpEvent;
  priceCents: number;
  currency: string;
  ticketType: string;
  returnUrl: string;
  hero: ReactNode;
  aside: ReactNode;
  initializeAction: (credential: string, data: FormData) => Promise<TicketSession>;
  checkSalesAction: () => Promise<"open" | "closed" | "unavailable">;
};

export default function TicketPurchaseForm({ slug, event, priceCents, currency, ticketType, returnUrl, hero, aside, initializeAction, checkSalesAction }: TicketPurchaseFormProps) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [progress, setProgress] = useState<PaymentStage | null>(null);
  const initializing = useRef(false);
  const attemptedData = useRef<FormData | null>(null);
  const [session, setSession] = useState<TicketSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [version, setVersion] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [paymentResult, setPaymentResult] = useState<boolean | null>(null);
  const [detailsLocked, setDetailsLocked] = useState(false);
  const waiting = paymentResult !== null || session?.status === "processing";
  const { purchase, finished, retry } = useTicketPurchase(slug, waiting);
  const ready = purchase?.status === "paid" && purchase.ticket_status === "valid" && !!purchase.ticket_code && !!purchase.ticket_url;

  useEffect(() => {
    if (!ready || !purchase?.ticket_url) {
      return;
    }
    // The ready status reflects the actual fulfilled ticket; navigation follows the paint
    // never a fake percentage or arbitrary progress timer.
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => router.replace(new URL(purchase.ticket_url!).pathname));
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
    };
  }, [ready, purchase?.ticket_url, router]);

  useEffect(() => {
    if (!version || session || initializing.current || !stripePromise) return;

    const timer = setTimeout(async () => {
      if (!form.current || initializing.current) return;
      const data = attemptedData.current ?? new FormData(form.current);
      const valid = validateRsvp(data, false);
      if (!valid.success) return;
      attemptedData.current = data;
      initializing.current = true;
      setDetailsLocked(true);
      setStarting(true);
      setFieldErrors({});
      try {
        const result = await initializeAction(await purchaseCredential(slug, valid.data.phone), data);
        setSession(result);
      } catch {
        setSession({
          status: "error",
          message: "Payment couldn’t load. Please try again.",
        });
      } finally {
        initializing.current = false;
        setStarting(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [version, session, slug, initializeAction]);

  if (session?.status === "closed") {
    return <TicketResult kind="closed" event={event} />;
  }
  if (session?.status === "already_purchased") return <TicketConfirmation event={event} slug={slug} alreadyPurchased />;

  const locked = starting || session?.status === "ready" || detailsLocked;
  const amount = session?.status === "ready" ? session.amountCents : priceCents;

  let stage = progress ?? "confirming";
  if (ready) {
    stage = "ready";
  } else if (waiting && purchase && (paymentResult === true || (session?.status === "processing" && session.paymentReceived) || purchase.status === "paid")) {
    stage = "preparing";
  } else if (waiting && (paymentResult === true || (session?.status === "processing" && session.paymentReceived))) {
    stage = "received";
  }

  const showProcessingOverlay = progress !== null || waiting || ready;

  return (
    <div>
      {showProcessingOverlay && <PaymentProcessingOverlay stage={stage} stalled={finished} onRetryAction={retry} />}
      {hero}
      <div className="narrow:px-4 tablet:grid-cols-[minmax(0,1fr)_220px] tablet:gap-7.5 tablet:px-7.5 tablet:py-10.5 mobile:block mobile:px-5 mobile:pt-5 mobile:pb-7.5 relative grid grid-cols-[minmax(0,1fr)_310px] gap-13.5 px-16 pt-8 pb-15">
        <section id="ticket-purchase" className="tablet:px-3 mobile:px-1 mobile:pb-5.75 min-w-0 scroll-mt-6 px-4 pb-6.5" aria-labelledby="ticket-title">
          <h2
            id="ticket-title"
            className="print-brush font-heading text-surface tablet:-mx-3 tablet:text-[27px] mobile:-mx-2 mobile:text-[27px] narrow:text-[24px] -mx-4 -mt-1.75 flex -rotate-1 items-center justify-center gap-4.5 px-2.5 pt-5 pb-5.5 text-center text-[35px] leading-[1.1] tracking-[.15em] uppercase"
          >
            ★ Get your ticket ★
          </h2>
          <p className="text-muted my-5.75">
            <span className="text-primary mt-5 ps-4 font-semibold"> All ticket sales are final and non-refundable. </span>
            One person, one ticket. Enter your own details. All fields are required
            <span className="text-primary">*</span>
          </p>
          <form
            ref={form}
            onSubmit={(e) => e.preventDefault()}
            onChange={() => setVersion((v) => v + 1)}
            noValidate
            onBlur={() => {
              if (!form.current || locked) return;
              const validation = validateRsvp(new FormData(form.current), false);
              const errors: Record<string, string> = {};
              if (!validation.success) for (const issue of validation.error.issues) errors[String(issue.path[0])] = issue.message;
              setFieldErrors(errors);
            }}
          >
            <div className="absolute size-px overflow-hidden [clip-path:inset(50%)]" aria-hidden="true">
              <label htmlFor="ticket-website">Leave empty</label>
              <input id="ticket-website" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <fieldset disabled={locked}>
              <legend className="sr-only">Your ticket details</legend>
              {(
                [
                  ["name", "Name", "text", "name", "Your full name", 100],
                  ["phone", "Phone number", "tel", "tel", "(201) 555-0123", 40],
                  ["email", "Email", "email", "email", "you@email.com", 254],
                ] as const
              ).map(([name, label, type, autoComplete, placeholder, maxLength]) => (
                <div key={name} className="mobile:mb-4.75 mb-5">
                  <label className={labelClassName} htmlFor={`ticket-${name}`}>
                    {label}
                  </label>
                  <input
                    className={controlClassName}
                    id={`ticket-${name}`}
                    name={name}
                    type={type}
                    autoComplete={autoComplete}
                    placeholder={placeholder}
                    required
                    maxLength={maxLength}
                    autoCapitalize={name === "email" ? "none" : undefined}
                    spellCheck={name === "email" ? false : undefined}
                    aria-invalid={!!fieldErrors[name]}
                    aria-describedby={fieldErrors[name] ? `ticket-${name}-error` : undefined}
                  />
                  {name === "phone" && <p className="text-muted mt-1.75 text-[13px]">Outside the US? Include + and your country code.</p>}
                  {fieldErrors[name] && (
                    <p className="text-primary mt-1.5 text-[14px] font-semibold" id={`ticket-${name}-error`}>
                      {fieldErrors[name]}
                    </p>
                  )}
                </div>
              ))}
              <div className="mobile:mb-4.75 mb-5">
                <label className={labelClassName} htmlFor="ticket-referral">
                  How did you hear about us?
                </label>
                <select className={`${controlClassName} pr-7`} id="ticket-referral" name="referralSource" defaultValue="" required aria-invalid={!!fieldErrors.referralSource}>
                  <option value="" disabled>
                    Select an option
                  </option>
                  {referralSources.map((source) => (
                    <option key={source}>{source}</option>
                  ))}
                </select>
                {fieldErrors.referralSource && <p className="text-primary mt-1.5 text-[14px] font-semibold">{fieldErrors.referralSource}</p>}
              </div>
            </fieldset>
          </form>

          <div className="border-border font-heading text-navy my-6 border-y py-5 text-center">
            <p className="text-2xl uppercase">{ticketType}</p>
            <p className="text-4xl">
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency,
                maximumFractionDigits: 2,
                minimumFractionDigits: 0,
              }).format(amount / 100)}
            </p>
          </div>

          {!stripePromise && <p role="alert">Ticket payments are temporarily unavailable. Please try again later.</p>}
          {starting && <p role="status">Preparing secure payment…</p>}
          {!session && !starting && stripePromise && <p className="text-muted font-semibold">Secure payment fields appear once your attendee details are complete.</p>}

          {session?.status === "checking" && (
            <div role="status" className="border-border border-l-4 p-4">
              <p>We’re checking an existing payment. Please don’t pay again until its status is confirmed.</p>
              <button
                type="button"
                className="mt-3 block underline"
                onClick={() => {
                  setSession(null);
                  setVersion((v) => v + 1);
                }}
              >
                Check payment status
              </button>
            </div>
          )}

          {session?.status === "error" && (
            <div role="alert" className="border-primary text-primary border-l-4 p-4">
              {session.message}
              <button
                type="button"
                className="mt-3 block underline"
                onClick={() => {
                  setSession(null);
                  setVersion((v) => v + 1);
                }}
              >
                Retry loading payment
              </button>
            </div>
          )}

          {session?.status === "ready" && stripePromise && (
            <Elements stripe={stripePromise} options={{ clientSecret: session.clientSecret, appearance }}>
              <TicketPayment
                slug={slug}
                returnUrl={returnUrl}
                onPaid={(received) => {
                  setPaymentResult(received);
                  setProgress(received ? "received" : "confirming");
                }}
                onProcessing={setProgress}
                checkSales={checkSalesAction}
                onClosed={() => setSession({ status: "closed" })}
              />
            </Elements>
          )}

          <p className="text-muted mt-5 text-[13px]">
            Your payment details are securely handled by Stripe. We collect your attendee details to manage your ticket. For help, contact @el_solar_timbero.
          </p>
        </section>
        {aside}
      </div>
    </div>
  );
}
