type EventDetailsProps = {
  variant?: "hero" | "result";
};

const itemClassName =
  "flex items-center gap-2 px-[13px] mobile:gap-1 mobile:px-[5px]";
const iconClassName =
  "h-7 w-[25px] shrink-0 fill-none stroke-primary stroke-[1.9] mobile:h-[25px] mobile:w-[17px] narrow:hidden";
const titleClassName =
  "font-heading text-[19px] leading-[1.1] uppercase mobile:text-[14px]";
const descriptionClassName =
  "mt-1 block font-sans text-[12px] leading-[1.35] normal-case mobile:text-[10px]";

export default function EventDetails({ variant = "hero" }: EventDetailsProps) {
  const placementClassName = variant === "hero"
    ? "tablet:flex-wrap tablet:gap-x-0 tablet:gap-y-[13px] tablet:flex-col tablet:items-start"
    : "justify-center mobile:-mx-[5px]";

  return (
    <div className={`mt-5.5 flex items-center text-left text-navy mobile:mt-4.25 mobile:justify-center ${placementClassName}`}>
      <div className={`event-date ${itemClassName} border-r-2 border-border pl-0 mobile:pl-0 tablet:border-none`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClassName}>
          <rect x="3" y="5" width="18" height="16" rx="1" />
          <path d="M7 2v6m10-6v6M3 11h18M7 15h3m4 0h3M7 18h3" />
        </svg>
        <p className={titleClassName}>Monday, Oct 12
          <time className="block text-[22px] mobile:whitespace-nowrap mobile:text-[16px]" dateTime="2026-10-12">8–11:30 PM</time>
        </p>
      </div>
      <div className={`event-location ${itemClassName} border-r-2 border-border h-[45.8px] tablet:border-none tablet:pl-0` }>
          <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClassName}>
              <g transform="rotate(-45 12 12)">
                  <path d="M4 6h16v3a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4V6Z" />
                  <path d="M12 7.5v2m0 2v2m0 2v1" />
                  <path d="M7 9h2m-2 6h2m6-6h2m-2 6h2" />
              </g>
          </svg>
        <p className={`${titleClassName} mobile:whitespace-nowrap`}>FREE.99</p>
      </div>
      <div className={`event-location ${itemClassName} pr-0 mobile:pr-0 ${variant === "hero" ? "tablet:basis-full tablet:px-0" : ""}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClassName}>
          <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        <p className={titleClassName}>Guantanamera<span className={descriptionClassName}>939 8th Ave<br />New York, NY 10019</span></p>
      </div>
    </div>
  );
}
