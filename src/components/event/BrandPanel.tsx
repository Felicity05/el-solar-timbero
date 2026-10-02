import Image from "next/image";

const imageText: string[] = ["La", "Música", "Vive", "Aquí"]
const textAccents: string[] = ["Música cubana", "Baile", "Comunidad", "Cultura", "Sabrosura"]

export default function BrandPanel() {
  return (
    <aside className="relative border-l-[3px] border-solid border-[#89755c80] pl-6.75 tablet:pl-4.5
      mobile:hidden"
           aria-label="Cuban music and community">
      <div className="relative -rotate-2 overflow-hidden border-[7px] border-surface bg-navy
        px-3.5 pt-1.5 text-background shadow-[2px_3px_0_#89755c25] outline outline-[#89755c55]
        mobile:border-4 mobile:px-1.5 mobile:pt-5.5">
        <span aria-hidden="true" className="absolute top-51.5 left-22.5 text-[15px] text-accent-sand
            tablet:top-40 tablet:left-16
            mobile:top-1.25 mobile:right-1.75 mobile:text-[13px]">★</span>
          {imageText.map((text, index) => (
            <span key={index} className="block -rotate-6 pl-2.25 font-birthstone align-middle
                    text-[45px] leading-[1.15] tablet:p-0
                    tablet:text-[35px] mobile:pl-0.75 mobile:text-[25px]" lang="es">
                {text}
            </span>
          ))}
        <Image
          className="mx-auto mt-2 -mb-3.25 h-auto w-full mobile:mt-0.5"
          src="/artwork/tumbadoras.png" alt="" width={320} height={360}
          sizes="(max-width: 640px) 150px, 300px"
        />
      </div>
      <p className="font-heading uppercase text-navy px-2 pt-9 -rotate-3
        pb-5.5 text-[34px] leading-[1.4] tracking-[-.015em] tablet:text-[27px] mobile:px-0 mobile:pt-0
        mobile:pb-3.75 mobile:text-[clamp(21px,5.7vw,32px)] mobile:leading-[1.55]" lang="es">
          {textAccents.map((word, index) => (
            <span key={word}>{index > 0 && <br />}
                <span className="text-primary" aria-hidden="true"> ★ </span>
                {word}
            </span>
      ))}</p>
    </aside>
  );
}
