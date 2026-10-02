import Image from "next/image";
import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="relative z-3 flex min-h-29.5 items-center gap-7 py-5 pr-14.5 pl-63 justify-between
                       tablet:pr-7.5 tablet:pl-53.5 mobile:min-h-22.75
                       mobile:py-3.5 mobile:pr-3 mobile:pl-32.5 mobile:gap-2">
      {/* A full navigation also resets the in-page RSVP result. */}
      <Link href="/" aria-label="El Solar Timbero home" className="absolute top-2.25 left-11.25 z-3 w-44 -rotate-5
              tablet:left-6.25 tablet:w-40 mobile:top-1.75 mobile:left-4.75 mobile:w-26.5">
        <Image className="h-auto w-full" src="/artwork/el-solar-logo-transparent.png" alt="El Solar Timbero — música, baile, comunidad"
          width={180} height={180} sizes="(max-width: 640px) 106px, 176px" priority
        />
      </Link>
      <p className="font-heading uppercase text-navy text-[26px] leading-[1.05] mobile:text-[16px] narrow:text-[14px]" lang="es">
          <span className="float-left mt-1.5 mr-3.5 text-[30px] text-primary mobile:mt-1.25 mobile:mr-2 mobile:text-[21px]" aria-hidden="true">★
          </span> Más que un placer,<br />un solar.
      </p>
        <div className="flex shrink-0 items-center gap-4 mobile:gap-2">
            <a href="#rsvp-title" className="print-brush inline-flex min-h-11 items-center px-7 py-2 font-heading text-[23px] uppercase text-surface hover:[--print-color:var(--color-primary-hover)] mobile:hidden">
                RSVP
            </a>
            <a className="group inline-flex min-h-12 items-center justify-center gap-3 text-left text-[14px] leading-[1.3]"
               aria-label="Follow El Solar Timbero on Instagram" href="https://www.instagram.com/el_solar_timbero/" target="_blank" rel="noopener noreferrer">
                <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="3" width="18" height="18" rx="5"/>
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/>
                </svg>
            </a>
        </div>
    </header>
  );
}
