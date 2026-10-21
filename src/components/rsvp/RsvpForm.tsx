import { useState, type Ref } from "react";
import { giftCardDisclaimer, referralSources, type RsvpField, type RsvpState } from "@/lib/rsvp/rsvp";

import { controlClassName, labelClassName } from "../shared/form-styles";

type RsvpFormProps = {
  disclaimerVersion: string | null;
  state: RsvpState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  errorSummaryRef: Ref<HTMLDivElement>;
};

// Imported by RsvpExperience, so this component is inside its client boundary.
export default function RsvpForm({ state, formAction, pending, errorSummaryRef, disclaimerVersion }: RsvpFormProps) {
  const [values, setValues] = useState({
    name: "",
    phone: "",
    email: "",
    referralSource: "",
    giftCardDisclaimerAccepted: false,
  });

  function errorProps(field: RsvpField) {
    return {
      "aria-invalid": !!state.errors?.[field],
      "aria-describedby": state.errors?.[field] ? `${field}-error` : undefined,
    };
  }

  function fieldError(field: RsvpField) {
    return state.errors?.[field] ? (
      <p className="text-primary mt-1.5 text-[14px] leading-[1.35] font-semibold" id={`${field}-error`}>
        {state.errors[field]}
      </p>
    ) : null;
  }

  return (
    <section className="tablet:px-3 mobile:px-1 mobile:pb-5.75 min-w-0 px-4 pb-6.5" aria-labelledby="rsvp-title">
      <h2
        id="rsvp-title"
        className="print-brush font-heading text-surface tablet:-mx-3 tablet:gap-2.5 tablet:text-[27px] mobile:-mx-2 mobile:gap-2.5 mobile:px-1 mobile:pt-4.5 mobile:pb-5 mobile:text-[27px] narrow:text-[24px] -mx-4 -mt-1.75 flex -rotate-1 items-center justify-center gap-4.5 rounded-none px-2.5 pt-5 pb-5.5 text-center text-[35px] leading-[1.1] tracking-[.015em] uppercase"
      >
        <span className="mobile:text-[16px] text-[22px]" aria-hidden="true">
          ★
        </span>
        RSVP for this event
        <span className="mobile:text-[16px] text-[22px]" aria-hidden="true">
          ★
        </span>
      </h2>
      <p className="text-muted mobile:my-4.75 mobile:text-[14px] mobile:leading-[1.45] my-5.75 text-[15px]">
        Save your spot on the dance floor. All fields are required
        <span className="text-primary"> *</span>
      </p>
      {/* React resets action forms after responses, including validation errors.
      Preserve all entered values until the server confirms the RSVP. */}
      <form action={formAction} noValidate aria-busy={pending} onReset={(event) => event.preventDefault()}>
        {state.status === "error" && (
          <div className="border-primary bg-surface text-primary mb-5 border-l-4 px-4 py-3" role="alert" tabIndex={-1} ref={errorSummaryRef}>
            {state.message}
          </div>
        )}
        <div className="absolute size-px overflow-hidden [clip-path:inset(50%)]" aria-hidden="true">
          <label htmlFor="website">Leave this field empty</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <fieldset disabled={pending}>
          <legend className="sr-only">Your RSVP details</legend>
          <div className="mobile:mb-4.75 mb-5">
            <label className={labelClassName} htmlFor="name">
              Name
            </label>
            <input
              className={controlClassName}
              id="name"
              name="name"
              autoComplete="name"
              placeholder="Your full name"
              required
              maxLength={100}
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              {...errorProps("name")}
            />
            {fieldError("name")}
          </div>
          <div className="mobile:mb-4.75 mb-5">
            <label className={labelClassName} htmlFor="phone">
              Phone number
            </label>
            <input
              className={controlClassName}
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="(201) 555-0123"
              required
              maxLength={40}
              value={values.phone}
              onChange={(e) => setValues({ ...values, phone: e.target.value })}
              {...errorProps("phone")}
              aria-describedby={`phone-hint${state.errors?.phone ? " phone-error" : ""}`}
            />
            <p id="phone-hint" className="text-muted mt-1.75 text-[13px] leading-[1.45]">
              Outside the US? Include + and your country code.
            </p>
            {fieldError("phone")}
          </div>
          <div className="mobile:mb-4.75 mb-5">
            <label className={labelClassName} htmlFor="email">
              Email
            </label>
            <input
              className={controlClassName}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@email.com"
              required
              maxLength={254}
              value={values.email}
              onChange={(e) => setValues({ ...values, email: e.target.value })}
              {...errorProps("email")}
            />
            {fieldError("email")}
          </div>
          <div className="mobile:mb-4.75 mb-5">
            <label className={labelClassName} htmlFor="referralSource">
              How did you hear about us?
            </label>
            <select
              className={`${controlClassName} pr-7`}
              id="referralSource"
              name="referralSource"
              required
              value={values.referralSource}
              onChange={(e) => setValues({ ...values, referralSource: e.target.value })}
              {...errorProps("referralSource")}
            >
              <option value="" disabled>
                Select an option
              </option>
              {referralSources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
            {fieldError("referralSource")}
          </div>
          {disclaimerVersion !== null && (
            <div className="border-border-subtle mobile:mt-5.75 mobile:pt-4.5 mt-6.5 border-t pt-5">
              <input type="hidden" name="displayed_disclaimer_version" value={disclaimerVersion} />
              <label className="mobile:text-[14px] flex cursor-pointer items-start gap-3 text-[15px] leading-normal" htmlFor="giftCardDisclaimerAccepted">
                <input
                  className="checked:bg-primary checked:border-border focus:ring-navy mt-px size-6 shrink-0 cursor-pointer appearance-none rounded-sm border focus:ring-2 focus:ring-offset-0 focus:outline-none"
                  id="giftCardDisclaimerAccepted"
                  name="giftCardDisclaimerAccepted"
                  type="checkbox"
                  required
                  checked={values.giftCardDisclaimerAccepted}
                  onChange={(e) => setValues({ ...values, giftCardDisclaimerAccepted: e.target.checked })}
                  {...errorProps("giftCardDisclaimerAccepted")}
                />
                <span>{giftCardDisclaimer}</span>
              </label>
              {fieldError("giftCardDisclaimerAccepted")}
              <p className="text-muted mobile:text-[12px] mt-2.75 pl-9 text-[13px] leading-[1.45]">
                An RSVP does not guarantee a gift card. Guantanamera determines eligibility and sends its own gift-card QR codes.
              </p>
            </div>
          )}
          <button
            type="submit"
            className="print-brush font-heading text-surface mx-auto mt-6.5 flex min-h-15 w-[60%] cursor-pointer items-center justify-center gap-7 rounded-none px-6 pt-3.25 pb-3.75 text-center text-[30px] leading-[1.1] font-bold tracking-[.09em] uppercase hover:[--print-color:var(--color-primary-hover)] disabled:opacity-[.72]"
            disabled={pending}
          >
            {pending ? "Saving your RSVP…" : "RSVP"}
          </button>
        </fieldset>
        <p className="text-muted mt-4 text-[12px] leading-normal">
          We collect these details to manage this event’s RSVPs
          {disclaimerVersion !== null ? " and the offer described above" : ""}. For questions about your information, contact{" "}
          <a className="underline underline-offset-[3px]" href="https://www.instagram.com/el_solar_timbero/" target="_blank" rel="noopener noreferrer">
            @elsolartimbero
          </a>
          .
        </p>
      </form>
    </section>
  );
}
