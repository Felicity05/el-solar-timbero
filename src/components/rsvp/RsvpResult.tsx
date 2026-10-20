import Image from "next/image";
import type { RsvpEvent } from "@/lib/rsvp/rsvp-event";
import EventDetails from "@/components/event/EventDetails";
import InstagramLink from "@/components/shared/InstagramLink";
import Link from "next/link";

type RsvpResultProps = {
  event: RsvpEvent;
  kind: "success" | "duplicate" | "closed";
};

export default function RsvpResult({ kind, event }: RsvpResultProps) {
  const success = kind === "success";
  const closed = kind === "closed";
  return (
    <section
      className={`mobile:min-h-225 mobile:px-5.5 mobile:pt-8.75 relative isolate min-h-232.5 overflow-hidden px-6.25 pt-7.5 text-center ${closed ? "mobile:pb-65 pb-87.5" : "mobile:pb-42.5 pb-55"}`}
      aria-labelledby={closed ? "rsvp-title" : "result-title"}
    >
      <Image
        className="mobile:-left-14.25 mobile:w-27.5 pointer-events-none absolute top-0 -left-11.25 z-1 h-auto w-45 opacity-95"
        src="/artwork/palm-leaves-left.png"
        alt=""
        width={220}
        height={330}
        sizes="180px"
      />
      <Image className="mobile:w-27.5 pointer-events-none absolute top-0 -right-11.25 z-1 h-auto w-45 opacity-95" src="/artwork/palm-leaves-right.png" alt="" width={220} height={330} sizes="180px" />
      <div className="relative z-2 mx-auto max-w-162.5">
        <p className="font-heading text-primary mb-3.5 text-[35px] leading-[1.3] tracking-[.2em]" aria-hidden="true">
          ― ★ ―
        </p>
        <h1
          id={closed ? "rsvp-title" : "result-title"}
          tabIndex={-1}
          className="font-heading text-navy mobile:text-[clamp(45px,12.7vw,75px)] text-[clamp(52px,7.5vw,88px)] leading-[.98] font-extrabold tracking-tight uppercase focus:outline-none"
          lang={success ? "es" : "en"}
        >
          {closed ? (
            <>
              <span className="print-ink-text text-navy">RSVPs ARE</span>
              <br />
              <span className="print-ink-text text-primary">NOW CLOSED</span>
            </>
          ) : success ? (
            <>
              <span className="print-ink-text text-navy">¡Nos vemos</span>
              <br />
              <span className="print-ink-text text-primary">en el Solar!</span>
            </>
          ) : (
            <>
              <span className="print-ink-text text-navy">You’re already</span>
              <br />
              <span className="print-ink-text text-primary">on the list!</span>
            </>
          )}
        </h1>
        <p lang={closed ? "es" : undefined} className="text-navy mobile:text-[21px] mx-auto mt-4.5 max-w-135 font-[Georgia,serif] text-[25px] leading-[1.35]">
          {closed ? "¡Nos vemos esta noche en El Solar!" : success ? "Your RSVP has been confirmed." : "Looks like this phone number has already RSVP’d for this event."}
        </p>
        <p className="font-heading text-primary my-3 text-[23px] leading-[1.3] tracking-[.2em]" aria-hidden="true">
          ― ★ ―
        </p>
        {closed ? (
          <p className="mobile:text-[16px] mx-auto max-w-115 text-[18px] leading-[1.4]">Join us tonight at Guantanamera for Cuban music, dance, and community.</p>
        ) : success ? (
          <p className="mobile:text-[16px] mx-auto max-w-115 text-[18px] leading-[1.4]">
            We’ve saved your RSVP and will share updates on Instagram.
            {event?.disclaimer_version && " Guantanamera will handle promotional e-gift-card communication separately. An RSVP does not guarantee a gift card."}
          </p>
        ) : (
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
        )}
        <div className="paper-surface mobile:mt-6.25 mobile:px-0 mobile:pt-4.5 mx-auto mt-7.5 mb-15 rounded-md px-3.75 py-5">
          <h2 className="font-heading text-navy mobile:text-[31px] text-[40px] leading-[1.1] uppercase">{event?.name ?? "Cuban Night Social"}</h2>
          <p className="font-heading text-navy mobile:text-[16px] text-[20px] tracking-[.06em] uppercase" lang="es">
            Música <span className="text-primary">★</span> Baile <span className="text-primary">★</span> Comunidad
          </p>
          <EventDetails event={event} variant="result" fullDate={closed} />
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
        </div>
        {closed && (
          <div className="mb-8">
            <p className="font-heading mobile:text-[25px] text-[31px] leading-[1.1] uppercase">Stay tuned for the next one!</p>
            <p className="mobile:text-[16px] mx-auto mt-3 max-w-115 text-[18px] leading-[1.4]">Follow @elsolartimbero on Instagram for upcoming events.</p>
            <InstagramLink className="text-navy mt-5" />
          </div>
        )}
      </div>
      <div className="mobile:h-65 pointer-events-none absolute inset-x-0 bottom-0 z-[-1] h-87.5 mask-[linear-gradient(transparent,black_30%)]" aria-hidden="true">
        <Image src="/artwork/homepage-capitol-street.png" alt="" fill sizes="(max-width: 1080px) 100vw, 1080px" className="object-cover object-bottom" />
        <Image
          src="/artwork/tumbadoras.png"
          alt=""
          width={250}
          height={300}
          sizes="(max-width: 640px) 130px, 230px"
          className="mobile:-bottom-2.5 mobile:-left-7.5 mobile:w-35 absolute -bottom-6.25 -left-10 h-auto w-60 -scale-x-100"
        />
        <Image
          src="/artwork/vintage-red-car.png"
          alt=""
          width={390}
          height={260}
          sizes="(max-width: 640px) 230px, 390px"
          className="mobile:-right-13.75 mobile:-bottom-3.25 mobile:w-60 absolute -right-10 -bottom-6.25 h-auto w-97.5"
        />
      </div>
    </section>
  );
}
