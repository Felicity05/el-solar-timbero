"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Appearance } from "@stripe/stripe-js";
import { validateRsvp } from "@/lib/rsvp/rsvp-validation";
import { referralSources } from "@/lib/rsvp/rsvp";
import type { TicketSession } from "@/lib/tickets/types";
import { controlClassName, labelClassName } from "../shared/form-styles";
import { purchaseCredential } from "./credential";
import TicketConfirmation from "./TicketConfirmation";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = key ? loadStripe(key) : null;
const appearance: Appearance = {
  theme: "stripe", variables: { colorPrimary: "#a52a2a", colorBackground: "#f6efdf", colorText: "#182c3a",
    colorDanger: "#a52a2a", fontFamily: "Georgia, serif", fontSizeBase: "16px", spacingUnit: "4px", borderRadius: "7px" },
  rules: { ".Input": { border: "1px solid #9a8266", padding: "14px", boxShadow: "none" },
    ".Input:focus": { borderColor: "#182c3a", boxShadow: "0 0 0 2px #182c3a" },
    ".Label": { fontWeight: "bold", color: "#182c3a" } },
};
const buttonClass = "print-brush mt-6.5 mx-auto flex min-h-15 w-[60%] cursor-pointer items-center justify-center px-6 py-3 font-heading text-[30px] text-surface disabled:opacity-60";

function Payment({ slug, returnUrl, onPaid }: { slug: string; returnUrl: string; onPaid: (received: boolean) => void }) {
  const stripe = useStripe(); const elements = useElements();
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);
  return <form onSubmit={async event => {
    event.preventDefault();
    if (!stripe || !elements || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const submitted = await elements.submit();
      if (submitted.error) { setError(submitted.error.message ?? "Check your payment details."); return; }
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${returnUrl}?event=${encodeURIComponent(slug)}` }, redirect: "if_required" });
      if (result.error) setError(result.error.message ?? "Payment failed. Please try again.");
      else if (["succeeded", "processing"].includes(result.paymentIntent.status)) onPaid(result.paymentIntent.status === "succeeded");
      else setError("Your payment needs another step. Please try again.");
    } catch { setError("We couldn’t confirm payment. Check your connection and try again; your order will be reused."); }
    finally { inFlight.current = false; setBusy(false); }
  }}>
    <PaymentElement options={{ wallets: { applePay: "never", googlePay: "never", link: "never" } }}
                    onReady={() => setLoaded(true)}
                    onLoadError={() => setError("Payment fields couldn’t load. Please refresh and try again.")}
                    defaultCollapsed = "false"
    />
    {error && <p role="alert" className="mt-4 text-primary">{error}</p>}
    <button className={buttonClass} type="submit" disabled={!stripe || !loaded || busy}>Buy Now</button>
    {busy && <p role="status" className="mt-3">Confirming your payment…</p>}
  </form>;
}

export default function TicketPurchaseForm({ slug, priceCents, currency, ticketType, returnUrl, hero, aside, initializeAction }: {
  slug: string; priceCents: number; currency: string; ticketType: string; returnUrl: string; hero: ReactNode; aside: ReactNode;
  initializeAction: (credential: string, data: FormData) => Promise<TicketSession>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const initializing = useRef(false);
  const attemptedData = useRef<FormData | null>(null);
  const [session, setSession] = useState<TicketSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [version, setVersion] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [paymentResult, setPaymentResult] = useState<boolean | null>(null);
  const [detailsLocked, setDetailsLocked] = useState(false);
  useEffect(() => {
    if (!version || session || initializing.current || !stripePromise) return;
    const timer = setTimeout(async () => {
      if (!form.current || initializing.current) return;
      const data = attemptedData.current ?? new FormData(form.current);
      const valid = validateRsvp(data, false);
      if (!valid.success) return;
      attemptedData.current = data;
      initializing.current = true; setDetailsLocked(true); setStarting(true); setFieldErrors({});
      try {
        const result = await initializeAction(await purchaseCredential(slug, valid.data.phone), data);
        setSession(result);
      } catch { setSession({ status: "error", message: "Payment couldn’t load. Please try again." }); }
      finally { initializing.current = false; setStarting(false); }
    }, 800);
    return () => clearTimeout(timer);
  }, [version, session, slug, initializeAction]);
  if (session?.status === "processing") return <TicketConfirmation slug={slug} paymentReceived={session.paymentReceived} />;
  if (paymentResult !== null) return <TicketConfirmation slug={slug} paymentReceived={paymentResult} />;
  if (session?.status === "already_purchased") return <section className="paper-surface p-10 text-center">
    <h1 className="font-heading text-4xl">You already have a ticket for this event.</h1>
    <TicketConfirmation slug={slug} alreadyPurchased />
  </section>;
  const locked = starting || session?.status === "ready" || detailsLocked;
  const amount = session?.status === "ready" ? session.amountCents : priceCents;
  return <div>{hero}<div className="relative grid grid-cols-[minmax(0,1fr)_310px] gap-13.5 px-16 pt-8 pb-15 tablet:grid-cols-[minmax(0,1fr)_220px] tablet:gap-7.5 tablet:px-7.5 tablet:py-10.5 mobile:block mobile:px-5 mobile:pt-5 mobile:pb-7.5 narrow:px-4">
    <section id="ticket-purchase" className="min-w-0 scroll-mt-6 px-4 pb-6.5 tablet:px-3 mobile:px-1 mobile:pb-5.75" aria-labelledby="ticket-title">
      <h2 id="ticket-title" className="print-brush -mx-4 -mt-1.75 flex -rotate-1 items-center justify-center gap-4.5 px-2.5 pt-5 pb-5.5 text-center font-heading text-[35px] leading-[1.1] tracking-[.015em] text-surface uppercase tablet:-mx-3 tablet:text-[27px] mobile:-mx-2 mobile:text-[27px] narrow:text-[24px]">★ Get your ticket ★</h2>
      <p className="my-5.75 text-[15px] text-muted">One person, one ticket. Enter your own details. All fields are required <span className="text-primary">*</span></p>
      <form ref={form} onSubmit={e => e.preventDefault()} onChange={() => setVersion(v => v + 1)} noValidate
        onBlur={() => {
          if (!form.current || locked) return;
          const validation = validateRsvp(new FormData(form.current), false);
          const errors: Record<string, string> = {};
          if (!validation.success) for (const issue of validation.error.issues) errors[String(issue.path[0])] = issue.message;
          setFieldErrors(errors);
        }}>
        <div className="absolute size-px overflow-hidden [clip-path:inset(50%)]" aria-hidden="true"><label htmlFor="ticket-website">Leave empty</label><input id="ticket-website" name="website" tabIndex={-1} autoComplete="off" /></div>
        <fieldset disabled={locked}><legend className="sr-only">Your ticket details</legend>
          {([ ["name", "Name", "text", "name", "Your full name", 100], ["phone", "Phone number", "tel", "tel", "(201) 555-0123", 40], ["email", "Email", "email", "email", "you@email.com", 254] ] as const).map(([name, label, type, autoComplete, placeholder, maxLength]) =>
            <div key={name} className="mb-5 mobile:mb-4.75"><label className={labelClassName} htmlFor={`ticket-${name}`}>{label}</label>
              <input className={controlClassName} id={`ticket-${name}`} name={name} type={type} autoComplete={autoComplete} placeholder={placeholder} required maxLength={maxLength}
                autoCapitalize={name === "email" ? "none" : undefined} spellCheck={name === "email" ? false : undefined}
                aria-invalid={!!fieldErrors[name]} aria-describedby={fieldErrors[name] ? `ticket-${name}-error` : undefined} />
              {name === "phone" && <p className="mt-1.75 text-[13px] text-muted">Outside the US? Include + and your country code.</p>}
              {fieldErrors[name] && <p className="mt-1.5 text-[14px] font-semibold text-primary" id={`ticket-${name}-error`}>{fieldErrors[name]}</p>}
            </div>)}
          <div className="mb-5 mobile:mb-4.75"><label className={labelClassName} htmlFor="ticket-referral">How did you hear about us?</label>
            <select className={`${controlClassName} pr-7`} id="ticket-referral" name="referralSource" defaultValue="" required aria-invalid={!!fieldErrors.referralSource}>
              <option value="" disabled>Select an option</option>{referralSources.map(source => <option key={source}>{source}</option>)}
            </select>{fieldErrors.referralSource && <p className="mt-1.5 text-[14px] font-semibold text-primary">{fieldErrors.referralSource}</p>}
          </div>
        </fieldset>
      </form>
      <div className="my-6 border-y border-border py-5 text-center font-heading text-navy">
        <p className="text-2xl uppercase">{ticketType}</p><p className="text-4xl">{new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(amount / 100)}</p>
      </div>
      {!stripePromise && <p role="alert">Ticket payments are temporarily unavailable. Please try again later.</p>}
      {starting && <p role="status">Preparing secure payment…</p>}
      {!session && !starting && stripePromise && <p className="text-muted">Secure payment fields appear once your attendee details are complete.</p>}
      {session?.status === "checking" && <div role="status" className="border-l-4 border-border p-4">
        <p>We’re checking an existing payment. Please don’t pay again until its status is confirmed.</p>
        <button type="button" className="mt-3 block underline" onClick={() => { setSession(null); setVersion(v => v + 1); }}>Check payment status</button>
      </div>}
      {session?.status === "error" && <div role="alert" className="border-l-4 border-primary p-4 text-primary">{session.message}
        <button type="button" className="mt-3 block underline" onClick={() => { setSession(null); setVersion(v => v + 1); }}>Retry loading payment</button></div>}
      {session?.status === "ready" && stripePromise && <Elements stripe={stripePromise} options={{ clientSecret: session.clientSecret, appearance }}>
        <Payment slug={slug} returnUrl={returnUrl} onPaid={setPaymentResult} />
      </Elements>}
      <p className="mt-4 text-[12px] text-muted">Your payment details are securely handled by Stripe. We collect your attendee details to manage your ticket. For help, contact @el_solar_timbero.</p>
    </section>{aside}</div></div>;
}
