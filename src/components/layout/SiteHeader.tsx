import Image from "next/image";
import Link from "next/link";
import { RSVP_OPEN } from "@/lib/rsvp/rsvp-config";

export default function SiteHeader({ ticketed = false }: { ticketed?: boolean }) {
  return (
    <header className="tablet:pr-7.5 tablet:pl-53.5 mobile:min-h-22.75 mobile:py-3.5 mobile:pr-3 mobile:pl-32.5 mobile:gap-2 relative z-3 flex min-h-29.5 items-center justify-between gap-7 py-5 pr-14.5 pl-63">
      {/* A full navigation also resets the in-page RSVP result. */}
      <Link href="/" aria-label="El Solar Timbero home" className="tablet:left-6.25 tablet:w-40 mobile:top-1.75 mobile:left-4.75 mobile:w-26.5 absolute top-2.25 left-11.25 z-3 w-44 -rotate-5">
        <Image
          className="h-auto w-full"
          src="/artwork/el-solar-logo-transparent.png"
          alt="El Solar Timbero — música, baile, comunidad"
          width={180}
          height={180}
          sizes="(max-width: 640px) 106px, 176px"
          priority
        />
      </Link>
      <p className="font-heading text-navy mobile:text-[16px] narrow:text-[14px] text-[26px] leading-[1.05] uppercase" lang="es">
        <span className="text-primary mobile:mt-1.25 mobile:mr-2 mobile:text-[21px] float-left mt-1.5 mr-3.5 text-[30px]" aria-hidden="true">
          ★
        </span>{" "}
        Más que un placer,
        <br />
        un solar.
      </p>
      <div className="mobile:gap-2 flex shrink-0 items-center gap-4">
        <a
          href={ticketed ? "#ticket-purchase" : "#rsvp-title"}
          className="print-brush font-heading text-surface mobile:hidden inline-flex min-h-11 items-center px-7 py-2 text-[23px] uppercase hover:[--print-color:var(--color-primary-hover)]"
        >
          {ticketed ? "Get Ticket" : RSVP_OPEN ? "RSVP" : "Tonight’s event"}
        </a>
        <a
          className="group inline-flex min-h-12 items-center justify-center gap-3 text-left text-[14px] leading-[1.3]"
          aria-label="Follow El Solar Timbero on Instagram"
          href="https://www.instagram.com/el_solar_timbero/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" />
          </svg>
        </a>
      </div>
    </header>
  );
}
