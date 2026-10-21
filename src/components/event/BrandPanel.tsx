import Image from "next/image";

const imageText: string[] = ["La", "Música", "Vive", "Aquí"];
const textAccents: string[] = ["Música cubana", "Baile", "Comunidad", "Cultura", "Sabrosura"];

export default function BrandPanel() {
  return (
    <aside className="tablet:pl-4.5 mobile:hidden relative border-l-[3px] border-solid border-[#89755c80] pl-6.75" aria-label="Cuban music and community">
      <div className="border-surface bg-navy text-background mobile:border-4 mobile:px-1.5 mobile:pt-5.5 relative -rotate-2 overflow-hidden border-[7px] px-3.5 pt-1.5 shadow-[2px_3px_0_#89755c25] outline outline-[#89755c55]">
        <span aria-hidden="true" className="text-accent-sand tablet:top-40 tablet:left-16 mobile:top-1.25 mobile:right-1.75 mobile:text-[13px] absolute top-51.5 left-22.5 text-[15px]">
          ★
        </span>
        {imageText.map((text, index) => (
          <span key={index} className="font-birthstone tablet:p-0 tablet:text-[35px] mobile:pl-0.75 mobile:text-[25px] block -rotate-6 pl-2.25 align-middle text-[45px] leading-[1.15]" lang="es">
            {text}
          </span>
        ))}
        <Image className="mobile:mt-0.5 mx-auto mt-2 -mb-3.25 h-auto w-full" src="/artwork/tumbadoras.png" alt="" width={320} height={360} sizes="(max-width: 640px) 150px, 300px" />
      </div>
      <p
        className="font-heading text-navy tablet:text-[27px] mobile:px-0 mobile:pt-0 mobile:pb-3.75 mobile:text-[clamp(21px,5.7vw,32px)] mobile:leading-[1.55] -rotate-3 px-2 pt-9 pb-5.5 text-[34px] leading-[1.4] tracking-[-.015em] uppercase"
        lang="es"
      >
        {textAccents.map((word, index) => (
          <span key={word}>
            {index > 0 && <br />}
            <span className="text-primary" aria-hidden="true">
              {" "}
              ★{" "}
            </span>
            {word}
          </span>
        ))}
      </p>
    </aside>
  );
}
