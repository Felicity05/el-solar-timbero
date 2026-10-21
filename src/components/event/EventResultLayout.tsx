import Image from "next/image";
import type { ReactNode } from "react";

export default function EventResultLayout({
  title,
  subtitle,
  description,
  children,
  afterCard,
  closed = false,
  lang = "en",
  subtitleLang,
  titleId = "result-title",
}: {
  title: ReactNode;
  subtitle: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  afterCard?: ReactNode;
  closed?: boolean;
  lang?: string;
  subtitleLang?: string;
  titleId?: string;
}) {
  return (
    <section
      className={`mobile:min-h-225 mobile:px-5.5 mobile:pt-8.75 relative isolate min-h-232.5 overflow-hidden px-6.25 pt-7.5 text-center ${closed ? "mobile:pb-65 pb-87.5" : "mobile:pb-42.5 pb-55"}`}
      aria-labelledby={titleId}
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
          id={titleId}
          tabIndex={-1}
          className="font-heading text-navy mobile:text-[clamp(45px,12.7vw,75px)] text-[clamp(52px,7.5vw,88px)] leading-[.98] font-extrabold tracking-tight uppercase focus:outline-none"
          lang={lang}
        >
          {title}
        </h1>
        <p lang={subtitleLang} className="text-navy mobile:text-[21px] mx-auto mt-4.5 max-w-135 font-[Georgia,serif] text-[25px] leading-[1.35]">
          {subtitle}
        </p>
        <p className="font-heading text-primary my-3 text-[23px] leading-[1.3] tracking-[.2em]" aria-hidden="true">
          ― ★ ―
        </p>
        {description}
        {children}
        {afterCard}
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
