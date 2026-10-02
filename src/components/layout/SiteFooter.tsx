import InstagramLink from "@/components/shared/InstagramLink";

export default function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-6.25 border-t-[6px] border-double
      border-background bg-navy print-ink px-16 pt-9.75 pb-5.5
      text-background tablet:px-7.5 mobile:justify-center mobile:gap-5.75 mobile:px-6
      mobile:pt-[29px] mobile:pb-[18px] mobile:text-center **:focus-visible:outline-background">
      <div className="mobile:w-full"><p className="font-heading text-[37px] leading-[1.1] uppercase mobile:text-[32px]">El Solar Timbero</p><p className="mt-[7px] font-[Georgia,serif] text-[16px] italic mobile:text-[14px]" lang="es">Más que un placer, un solar.</p>
      </div>
      <InstagramLink />
      <p className="w-full border-t border-[#f3e6cc50] pt-4.5 text-center text-[12px] tracking-[.13em] uppercase
        mobile:text-[10px] mobile:tracking-[.04em]">
          New York, NY
          <span className="px-3" aria-hidden="true">★</span>
          Música · Baile · Comunidad
      </p>
    </footer>
  );
}
