import Image from "next/image";
import EventDetails from "@/components/event/EventDetails";
import InstagramLink from "@/components/shared/InstagramLink";

type RsvpResultProps = {
  kind: "success" | "duplicate";
};

export default function RsvpResult({ kind }: RsvpResultProps) {
  const success = kind === "success";
  return (
    <section className="relative isolate min-h-[930px] overflow-hidden px-[25px] pt-[30px] pb-[220px] text-center
      mobile:min-h-[900px] mobile:px-[22px] mobile:pt-[35px] mobile:pb-[170px]" aria-labelledby="result-title">
      <Image
        className="pointer-events-none absolute top-0 -left-[45px] z-[1] h-auto w-[180px] opacity-95
          mobile:-left-[57px] mobile:w-[110px]"
        src="/artwork/palm-leaves-left.png"
        alt=""
        width={220}
        height={330}
        sizes="180px"
      />
      <Image
        className="pointer-events-none absolute top-0 -right-[45px] z-[1] h-auto w-[180px] opacity-95 mobile:w-[110px]"
        src="/artwork/palm-leaves-right.png"
        alt=""
        width={220}
        height={330}
        sizes="180px"
      />
      <div className="relative z-[2] mx-auto max-w-[650px]">
        <p className="mb-[14px] font-heading text-[35px] leading-[1.3] tracking-[.2em] text-primary" aria-hidden="true">― ★ ―</p>
        <h1
          id="result-title"
          tabIndex={-1}
          className="font-heading uppercase text-navy text-[clamp(52px,7.5vw,88px)] leading-[.98] font-extrabold
            tracking-[-.025em] focus:outline-none mobile:text-[clamp(45px,12.7vw,75px)]"
          lang={success ? "es" : "en"}
        >
          {success ? <>¡Nos vemos<br /><span className="print-ink-text text-primary">en el Solar!</span></> : <>You’re already<br /><span className="print-ink-text text-primary">on the list!</span></>}
        </h1>
        <p className="mx-auto mt-[18px] max-w-[540px] font-[Georgia,serif] text-[25px] leading-[1.35] text-navy mobile:text-[21px]">{success ? "Your RSVP has been confirmed." : "Looks like this phone number has already RSVP’d for this event."}</p>
        <p className="my-3 font-heading text-[23px] leading-[1.3] tracking-[.2em] text-primary" aria-hidden="true">― ★ ―</p>
        {success ? <p className="mx-auto max-w-[460px] text-[18px] leading-[1.4] mobile:text-[16px]">We’ve saved your RSVP and will share updates on Instagram. Guantanamera will handle any promotional e-gift-card communication separately. An RSVP does not guarantee a gift card.</p> : <><p className="my-[18px] font-[Georgia,serif] text-[31px] text-primary italic mobile:text-[25px]" lang="es">¡Nos vemos en el Solar!</p><p className="mx-auto max-w-[460px] text-[18px] leading-[1.4] mobile:text-[16px]">If you think this is a mistake, <a className="underline underline-offset-[3px]" href="https://www.instagram.com/elsolartimbero/" target="_blank" rel="noopener noreferrer">contact us on Instagram</a>.</p></>}
        <div className="paper-surface mx-auto mt-[30px] mb-[23px] border-y border-border-subtle px-[15px] py-5 mobile:mt-[25px] mobile:px-0
          mobile:pt-[18px]">
          <h2 className="font-heading text-[40px] leading-[1.1] text-navy uppercase mobile:text-[31px]">Cuban Night Social</h2>
          <p className="font-heading text-[20px] tracking-[.06em] text-navy uppercase mobile:text-[16px]" lang="es">Música <span className="text-primary">★</span> Baile <span className="text-primary">★</span> Comunidad</p>
          <EventDetails variant="result" />
          {/* A full navigation resets the in-page form state. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="print-brush inline-flex min-h-[60px] items-center justify-center gap-7 rounded-none px-6 pt-[13px] pb-[15px]
            text-center font-heading text-[30px] leading-[1.1] font-bold tracking-[.09em] text-surface
            uppercase cursor-pointer hover:[--print-color:var(--color-primary-hover)]
            disabled:cursor-wait disabled:opacity-[.72] mt-[27px] min-w-[270px] mobile:min-w-60
            mobile:text-[25px]" href="/">{success ? "Back to home" : "View event"} <span aria-hidden="true">→</span></a>
        </div>
        <InstagramLink className="px-[18px] py-2 text-navy" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-[1] h-[350px]
        [mask-image:linear-gradient(transparent,black_30%)] mobile:h-[260px]" aria-hidden="true">
        <Image
          src="/artwork/homepage-capitol-street.png"
          alt=""
          fill
          sizes="(max-width: 1080px) 100vw, 1080px"
          className="object-cover object-bottom"
        />
        <Image
          src="/artwork/tumbadoras.png"
          alt=""
          width={250}
          height={300}
          sizes="(max-width: 640px) 130px, 230px"
          className="absolute -bottom-[25px] -left-10 h-auto w-60 mobile:-bottom-[10px] mobile:-left-[30px] mobile:w-[140px]"
        />
        <Image
          src="/artwork/vintage-red-car.png"
          alt=""
          width={390}
          height={260}
          sizes="(max-width: 640px) 230px, 390px"
          className="absolute -right-10 -bottom-[25px] h-auto w-[390px] mobile:-right-[55px] mobile:-bottom-[5px] mobile:w-60"
        />
      </div>
    </section>
  );
}
