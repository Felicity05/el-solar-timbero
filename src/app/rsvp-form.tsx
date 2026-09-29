"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { submitRsvp } from "./actions";
import { giftCardDisclaimer, referralSources, type RsvpField, type RsvpState } from "@/lib/rsvp";

const initialState: RsvpState = { status: "idle" };

export default function RsvpExperience({ hero, aside, success, duplicate }: {
  hero: ReactNode; aside: ReactNode; success: ReactNode; duplicate: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(submitRsvp, initialState);
  const [values, setValues] = useState({ name: "", phone: "", email: "", referralSource: "", giftCardDisclaimerAccepted: false });
  const container = useRef<HTMLDivElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "success" || state.status === "duplicate") {
      container.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    } else if (state.status === "error") {
      errorSummary.current?.focus();
    }
  }, [state]);

  function errorProps(field: RsvpField) {
    return { "aria-invalid": !!state.errors?.[field], "aria-describedby": state.errors?.[field] ? `${field}-error` : undefined };
  }
  function fieldError(field: RsvpField) {
    return state.errors?.[field] ? <p className="field-error" id={`${field}-error`}>{state.errors[field]}</p> : null;
  }

  if (state.status === "success" || state.status === "duplicate") {
    return <div ref={container}>{state.status === "success" ? success : duplicate}</div>;
  }

  return (
    <div ref={container}>
      {hero}
      <div className="rsvp-layout">
        <section className="form-section" aria-labelledby="rsvp-title">
          <h2 id="rsvp-title" className="print-heading"><span aria-hidden="true">★</span> RSVP for this event <span aria-hidden="true">★</span></h2>
          <p className="form-intro">Save your spot on the dance floor. All fields are required.</p>
          {/* React resets action forms after responses, including validation errors.
              Preserve all entered values until the server confirms the RSVP. */}
          <form action={formAction} noValidate aria-busy={pending} onReset={event => event.preventDefault()}>
            {state.status === "error" && <div className="error-summary" role="alert" tabIndex={-1} ref={errorSummary}>{state.message}</div>}
            <div className="honeypot" aria-hidden="true"><label htmlFor="website">Leave this field empty</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
            <fieldset disabled={pending}>
              <legend className="sr-only">Your RSVP details</legend>
              <div className="form-field"><label htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" placeholder="Your full name" required maxLength={100} value={values.name} onChange={e => setValues({ ...values, name: e.target.value })} {...errorProps("name")} />{fieldError("name")}</div>
              <div className="form-field"><label htmlFor="phone">Phone number</label><input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="(201) 555-0123" required maxLength={40} value={values.phone} onChange={e => setValues({ ...values, phone: e.target.value })} {...errorProps("phone")} aria-describedby={`phone-hint${state.errors?.phone ? " phone-error" : ""}`} /><p id="phone-hint" className="field-hint">Outside the US? Include + and your country code.</p>{fieldError("phone")}</div>
              <div className="form-field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@email.com" required maxLength={254} value={values.email} onChange={e => setValues({ ...values, email: e.target.value })} {...errorProps("email")} />{fieldError("email")}</div>
              <div className="form-field"><label htmlFor="referralSource">How did you hear about us?</label><select id="referralSource" name="referralSource" required value={values.referralSource} onChange={e => setValues({ ...values, referralSource: e.target.value })} {...errorProps("referralSource")}><option value="" disabled>Select an option</option>{referralSources.map(source => <option key={source} value={source}>{source}</option>)}</select>{fieldError("referralSource")}</div>
              <div className="acknowledgment"><label htmlFor="giftCardDisclaimerAccepted"><input id="giftCardDisclaimerAccepted" name="giftCardDisclaimerAccepted" type="checkbox" required checked={values.giftCardDisclaimerAccepted} onChange={e => setValues({ ...values, giftCardDisclaimerAccepted: e.target.checked })} {...errorProps("giftCardDisclaimerAccepted")} /><span>{giftCardDisclaimer}</span></label>{fieldError("giftCardDisclaimerAccepted")}<p className="gift-card-note">An RSVP does not guarantee a gift card. Guantanamera determines eligibility and generates and sends its own gift-card QR codes.</p></div>
              <button type="submit" className="print-button submit-button" disabled={pending}>{pending ? "Saving your RSVP…" : "RSVP"} {!pending && <span aria-hidden="true"></span>}</button>
            </fieldset>
            <p className="privacy-note">We collect these details to manage this event’s RSVPs and the offer described above. For questions about your information, contact <a href="https://www.instagram.com/el_solar_timbero/" target="_blank" rel="noopener noreferrer">@elsolartimbero</a>.</p>
          </form>
        </section>
        {aside}
      </div>
    </div>
  );
}
