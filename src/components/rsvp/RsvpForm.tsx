import { useState, type Ref } from "react";
import { giftCardDisclaimer, referralSources, type RsvpField, type RsvpState } from "@/lib/rsvp";

// Shared by this form’s native text inputs and select. Keep complete utility names for Tailwind.
const controlClassName =
  `block min-h-[54px] w-full rounded-[2px] border border-border bg-surface/85 px-[14px] py-[13px]
  font-sans text-[16px] leading-[1.35] text-foreground shadow-[inset_0_2px_3px_#89755c08]
  placeholder:text-[#756b5d] placeholder:opacity-100 hover:border-navy aria-invalid:border-2
  aria-invalid:border-primary mobile:min-h-[52px] mobile:p-3`;
const labelClassName =
  "mb-[7px] block font-[Georgia,serif] text-[17px] leading-[1.3] font-bold text-navy mobile:text-[16px]";

type RsvpFormProps = {
  state: RsvpState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  errorSummaryRef: Ref<HTMLDivElement>;
};

// Imported by RsvpExperience, so this component is inside its client boundary.
export default function RsvpForm({ state, formAction, pending, errorSummaryRef }: RsvpFormProps) {
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
    return state.errors?.[field]
      ? <p className="mt-[6px] text-[14px] leading-[1.35] font-semibold text-primary" id={`${field}-error`}>{state.errors[field]}</p>
      : null;
  }

  return (
    <section className="min-w-0 px-4 pb-[26px]
      tablet:px-3 mobile:px-1 mobile:pb-[23px]" aria-labelledby="rsvp-title">
      <h2 id="rsvp-title" className="print-brush -mx-4 -mt-[7px] flex -rotate-1 items-center justify-center
        gap-[18px] rounded-none px-[10px] pt-5 pb-[22px]
        text-center font-heading text-[35px] leading-[1.1] tracking-[.015em] text-surface uppercase
        tablet:-mx-3 tablet:gap-[10px] tablet:text-[27px] mobile:-mx-2
        mobile:gap-[10px] mobile:px-1 mobile:pt-[18px] mobile:pb-5 mobile:text-[27px] narrow:text-[24px]"><span className="text-[22px] mobile:text-[16px]" aria-hidden="true">★</span> RSVP for this event <span className="text-[22px] mobile:text-[16px]" aria-hidden="true">★</span></h2>
      <p className="my-[23px] text-[15px] text-muted mobile:my-[19px] mobile:text-[14px] mobile:leading-[1.45]">Save your spot on the dance floor. All fields are required.</p>
      {/* React resets action forms after responses, including validation errors.
      Preserve all entered values until the server confirms the RSVP. */}
      <form
        action={formAction}
        noValidate
        aria-busy={pending}
        onReset={event => event.preventDefault()}
      >
        {state.status === "error" && <div
          className="mb-5 border-l-4 border-primary bg-surface px-4 py-3 text-primary"
          role="alert"
          tabIndex={-1}
          ref={errorSummaryRef}
        >{state.message}</div>}
        <div className="absolute size-px overflow-hidden [clip-path:inset(50%)]" aria-hidden="true">
          <label htmlFor="website">Leave this field empty</label>
          <input
            id="website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <fieldset disabled={pending}>
          <legend className="sr-only">Your RSVP details</legend>
          <div className="mb-5 mobile:mb-[19px]">
            <label className={labelClassName} htmlFor="name">Name</label>
            <input
              className={controlClassName}
              id="name"
              name="name"
              autoComplete="name"
              placeholder="Your full name"
              required
              maxLength={100}
              value={values.name}
              onChange={e => setValues({ ...values, name: e.target.value })}
              {...errorProps("name")}
            />
            {fieldError("name")}
          </div>
          <div className="mb-5 mobile:mb-[19px]">
            <label className={labelClassName} htmlFor="phone">Phone number</label>
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
              onChange={e => setValues({ ...values, phone: e.target.value })}
              {...errorProps("phone")}
              aria-describedby={`phone-hint${state.errors?.phone ? " phone-error" : ""}`}
            />
            <p id="phone-hint" className="mt-[7px] text-[13px] leading-[1.45] text-muted">Outside the US? Include + and your country code.</p>
            {fieldError("phone")}
          </div>
          <div className="mb-5 mobile:mb-[19px]">
            <label className={labelClassName} htmlFor="email">Email</label>
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
              onChange={e => setValues({ ...values, email: e.target.value })}
              {...errorProps("email")}
            />
            {fieldError("email")}
          </div>
          <div className="mb-5 mobile:mb-[19px]">
            <label className={labelClassName} htmlFor="referralSource">How did you hear about us?</label>
            <select
              className={`${controlClassName} pr-7`}
              id="referralSource"
              name="referralSource"
              required
              value={values.referralSource}
              onChange={e => setValues({ ...values, referralSource: e.target.value })}
              {...errorProps("referralSource")}
            >
              <option value="" disabled>Select an option</option>
              {referralSources.map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
            {fieldError("referralSource")}
          </div>
          <div className="mt-[26px] border-t border-border-subtle pt-5 mobile:mt-[23px] mobile:pt-[18px]">
            <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-[1.5] mobile:text-[14px]" htmlFor="giftCardDisclaimerAccepted"><input
              className="mt-px size-6 shrink-0 accent-primary"
              id="giftCardDisclaimerAccepted"
              name="giftCardDisclaimerAccepted"
              type="checkbox"
              required
              checked={values.giftCardDisclaimerAccepted}
              onChange={e => setValues({ ...values, giftCardDisclaimerAccepted: e.target.checked })}
              {...errorProps("giftCardDisclaimerAccepted")}
            /><span>{giftCardDisclaimer}</span></label>
            {fieldError("giftCardDisclaimerAccepted")}
            <p className="mt-[11px] pl-9 text-[13px] leading-[1.45] text-muted mobile:text-[12px]">An RSVP does not guarantee a gift card. Guantanamera determines eligibility and generates and sends its own gift-card QR codes.</p>
          </div>
          <button type="submit" className="print-brush inline-flex min-h-[60px] items-center justify-center gap-7 rounded-none px-6 pt-[13px] pb-[15px]
            text-center font-heading text-[30px] leading-[1.1] font-bold tracking-[.09em] text-surface
            uppercase cursor-pointer hover:[--print-color:var(--color-primary-hover)]
            disabled:cursor-wait disabled:opacity-[.72] mt-[26px] w-full" disabled={pending}>{pending ? "Saving your RSVP…" : "RSVP"} {!pending && <span aria-hidden="true">→</span>}</button>
        </fieldset>
        <p className="mt-4 text-[12px] leading-[1.5] text-muted">We collect these details to manage this event’s RSVPs and the offer described above. For questions about your information, contact <a className="underline underline-offset-[3px]" href="https://www.instagram.com/el_solar_timbero/" target="_blank" rel="noopener noreferrer">@elsolartimbero</a>.</p>
      </form>
    </section>
  );
}
