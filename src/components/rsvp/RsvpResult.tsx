import type { RsvpEvent } from "@/lib/rsvp/rsvp-event";
import EventResultLayout from "@/components/event/EventResultLayout";
import EventResultCard from "@/components/event/EventResultCard";
import InstagramLink from "@/components/shared/InstagramLink";
import Link from "next/link";

export default function RsvpResult({ kind, event }: { event: RsvpEvent; kind: "success" | "duplicate" | "closed" }) {
  const success = kind === "success";
  const closed = kind === "closed";
  let title;
  let subtitle;
  let description;
  if (closed) {
    title = (
      <>
        <span className="print-ink-text text-navy">RSVPs ARE</span>
        <br />
        <span className="print-ink-text text-primary">NOW CLOSED</span>
      </>
    );
    subtitle = "¡Nos vemos esta noche en El Solar!";
    description = <p className="mobile:text-[16px] mx-auto max-w-115 text-[18px] leading-[1.4]">Join us tonight at {event?.venue_name ?? "the venue"} for Cuban music, dance, and community.</p>;
  } else if (success) {
    title = (
      <>
        <span className="print-ink-text text-navy">¡Nos vemos</span>
        <br />
        <span className="print-ink-text text-primary">en el Solar!</span>
      </>
    );
    subtitle = "Your RSVP has been confirmed.";
    description = (
      <p className="mobile:text-[16px] mx-auto max-w-115 text-[18px] leading-[1.4]">
        We’ve saved your RSVP and will share updates on Instagram.
        {event?.disclaimer_version && " Guantanamera will handle promotional e-gift-card communication separately. An RSVP does not guarantee a gift card."}
      </p>
    );
  } else {
    title = (
      <>
        <span className="print-ink-text text-navy">You’re already</span>
        <br />
        <span className="print-ink-text text-primary">on the list!</span>
      </>
    );
    subtitle = "Looks like this phone number has already RSVP’d for this event.";
    description = (
      <>
        <p className="text-primary mobile:text-[25px] my-4.5 font-[Georgia,serif] text-[31px] italic" lang="es">
          ¡Nos vemos en el Solar!
        </p>
        <p className="mobile:text-[16px] mx-auto max-w-115 text-[18px] leading-[1.4]">
          If you think this is a mistake,{" "}
          <a className="underline underline-offset-[3px]" href="https://www.instagram.com/elsolartimbero/" target="_blank" rel="noopener noreferrer">
            contact us on Instagram
          </a>
          .
        </p>
      </>
    );
  }
  return (
    <EventResultLayout
      closed={closed}
      titleId={closed ? "rsvp-title" : "result-title"}
      lang={success ? "es" : "en"}
      subtitleLang={closed ? "es" : undefined}
      title={title}
      subtitle={subtitle}
      description={description}
      afterCard={
        closed && (
          <div className="mb-8">
            <p className="font-heading mobile:text-[25px] text-[31px] leading-[1.1] uppercase">Stay tuned for the next one!</p>
            <p className="mobile:text-[16px] mx-auto mt-3 max-w-115 text-[18px] leading-[1.4]">Follow @elsolartimbero on Instagram for upcoming events.</p>
            <InstagramLink className="text-navy mt-5" />
          </div>
        )
      }
    >
      <EventResultCard name={event?.name ?? "Cuban Night Social"} event={event} fullDate={closed}>
        {!closed && (
          <>
            {/* A full navigation resets the in-page form state. */}
            <Link
              className="print-brush font-heading text-surface mobile:min-w-60 mobile:text-[25px] mt-6.75 inline-flex min-h-15 min-w-67.5 cursor-pointer items-center justify-center gap-7 rounded-none px-6 pt-3.25 pb-3.75 text-center text-[30px] leading-[1.1] font-bold tracking-[.09em] uppercase hover:[--print-color:var(--color-primary-hover)] disabled:opacity-[.72]"
              href="/"
            >
              {success ? "Back to home" : "View event"}
            </Link>
          </>
        )}
      </EventResultCard>
    </EventResultLayout>
  );
}
