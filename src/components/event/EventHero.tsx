import Image from "next/image";
import EventDetails from "./EventDetails";
import styles from "./EventHero.module.css";

export default function EventHero() {
  return (
    <section className="relative isolate min-h-165 tablet:min-h-147.5 mobile:flex
      mobile:min-h-0 mobile:flex-col" aria-labelledby="event-title">
      <div className={`${styles.scene} absolute inset-0 z-[-1] overflow-hidden mobile:relative mobile:z-0
        mobile:h-77.5 mobile:w-full mobile:overflow-visible`} aria-hidden="true">
        <Image src="/artwork/homepage-capitol-street.png"
          alt="" fill priority sizes="(max-width: 1280px) 100vw, 1280px"
          className="object-cover object-[65%_70%]"
        />
        <Image
          src="/artwork/vintage-red-car.png" alt="" width={550} height={367}
          sizes="(max-width: 640px) 250px, 430px"
          className="absolute -right-10 -bottom-9.5 z-1 h-auto w-107.5 tablet:-right-32.5 -scale-x-100 -rotate-2
            mobile:-right-12.5 mobile:-bottom-4 mobile:w-62.5 mobile:-rotate-3"
        />
        <Image
          src="/artwork/cuban-dance-couple.png" alt="" priority width={380} height={570}
          sizes="(max-width: 640px) 240px, 400px"
          className="absolute right-68 -bottom-6.5 z-2 h-148.75 w-auto object-contain drop-shadow-[6px_8px_2px_#39291925]
            lg:right-60 tablet:right-2.5 tablet:h-113 tablet:right-30 tablet:-bottom-5
            mobile:right-[calc(50%-40px)] mobile:-bottom-2 mobile:h-76.25"
        />
        <Image
          src="/artwork/palm-leaves-right.png" alt="" width={360} height={540}
          sizes="(max-width: 640px) 145px, 260px"
          className="pointer-events-none absolute -top-20 -right-17.5 z-3 h-auto w-65 -rotate-12
            tablet:w-55
            mobile:-top-7 mobile:-right-15 mobile:w-36.25 mobile:rotate-10"
        />
        <Image
          src="/artwork/palm-leaves-left.png" alt="" width={180} height={270}
          sizes="(max-width: 640px) 110px, 170px"
          className="pointer-events-none absolute -left-15 -top-10 z-3 h-auto w-42.5 rotate-65
            tablet:w-35
            mobile:-left-16.25 mobile:-top-5 mobile:w-27.5 mobile:rotate-25"
        />
      </div>


      <div className="relative w-[65%] pt-22 pb-10.5 pl-14.5 ml-20 lg:-ml-3
        tablet:w-[62%] tablet:pl-7.5 tablet:ml-5 lg:ml-10
        mobile:w-full mobile:px-5 mobile:pt-2.5 mobile:pb-7 mobile:text-center narrow:px-3.5 mobile:m-0">
        <p className="font-heading uppercase text-navy mb-3 flex items-center gap-3 text-[18px] tracking-[.18em]
          mobile:mb-2.5 mobile:justify-center mobile:gap-2.75 mobile:text-[14px]
          mobile:tracking-[.17em]"><span className="text-primary" aria-hidden="true">★</span> Next event <span className="text-primary" aria-hidden="true">★</span></p>
        <h1 id="event-title" className="origin-left -rotate-3 font-heading uppercase text-navy text-[clamp(64px,7.2vw,92px)] leading-[.93] font-extrabold
          tracking-[-.035em] tablet:text-[clamp(58px,7.5vw,75px)] mobile:rotate-0 mobile:whitespace-nowrap mobile:text-[clamp(32px,9.2vw,56px)]
          mobile:leading-[.97] mobile:tracking-[-.03em]"><span className="print-ink-text text-primary text-[2.05em] leading-[.86]
          tracking-[-.045em] mobile:mr-[.13em] mobile:text-[1em] mobile:leading-[.97]">Cuban</span><br className="mobile:hidden" /><span className="print-ink-text text-navy">Night Social</span></h1>
        <p className="font-heading uppercase text-navy mt-5 max-w-120
          pb-3.75 text-[23px] leading-[1.2] tablet:max-w-92.5 tablet:text-[21px] mobile:mx-auto
          mobile:mt-3 mobile:hidden mobile:max-w-77.5 mobile:pb-3.25 mobile:text-[17px]
          mobile:leading-tight" lang="es">Timba, son y lo mejor de la música cubana</p>
        <p className="mt-2 hidden font-heading text-[17px] uppercase tracking-[.06em] text-navy mobile:block" lang="es">Música <span className="text-primary">★</span> Baile <span className="text-primary">★</span> Comunidad</p>
        <EventDetails variant="hero" />
      </div>
    </section>
  );
}