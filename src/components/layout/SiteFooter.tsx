import InstagramLink from "@/components/shared/InstagramLink";

export default function SiteFooter() {
  return (
    <footer className="border-background bg-navy print-ink text-background tablet:px-7.5 mobile:justify-center mobile:gap-5.75 mobile:px-6 mobile:pt-[29px] mobile:pb-[18px] mobile:text-center **:focus-visible:outline-background flex flex-wrap items-center justify-between gap-6.25 border-t-[6px] border-double px-16 pt-9.75 pb-5.5">
      <div className="mobile:w-full">
        <p className="font-heading mobile:text-[32px] text-[37px] leading-[1.1] uppercase">El Solar Timbero</p>
        <p className="mobile:text-[14px] mt-[7px] font-[Georgia,serif] text-[16px] italic" lang="es">
          Más que un placer, un solar.
        </p>
      </div>
      <InstagramLink />
      <p className="mobile:text-[10px] mobile:tracking-[.04em] w-full border-t border-[#f3e6cc50] pt-4.5 text-center text-[12px] tracking-[.13em] uppercase">
        New York, NY
        <span className="px-3" aria-hidden="true">
          ★
        </span>
        Música · Baile · Comunidad
      </p>
    </footer>
  );
}
