import type { RsvpEvent } from "@/lib/rsvp/rsvp-event";

export type EventDetailsData = Pick<RsvpEvent, "event_date" | "starts_at" | "ends_at" | "timezone" | "venue_name" | "venue_address" | "admission_mode" | "price_cents" | "currency">;

type EventDetailsProps = {
  event: EventDetailsData;
  variant?: "hero" | "result";
  fullDate?: boolean;
  showAdmission?: boolean;
};

const itemClassName = "flex items-center gap-2 px-[13px] mobile:gap-1 mobile:px-[5px]";
const iconClassName = "h-7 w-[25px] shrink-0 fill-none stroke-primary stroke-[1.9] mobile:h-[25px] mobile:w-[17px] narrow:hidden";
const titleClassName = "font-heading text-[19px] leading-[1.1] uppercase mobile:text-[14px]";
const descriptionClassName = "mt-1 block font-sans text-[12px] leading-[1.35] normal-case mobile:text-[10px]";

export default function EventDetails({ event, variant = "hero", fullDate = false, showAdmission = true }: EventDetailsProps) {
  // Calendar dates are formatted in UTC so the browser/server timezone cannot
  // shift them. Start/end instants are formatted in the event's own timezone.
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(fullDate ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${event.event_date}T12:00:00Z`));
  const timeFormat = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timezone,
  });
  const startTime = timeFormat.format(new Date(event.starts_at));
  const endTime = timeFormat.format(new Date(event.ends_at));
  const timeLabel = `${startTime} – ${endTime}PM`;
  const compactStart = startTime.replace(/:00\b/g, "");
  const compactEnd = endTime.replace(/:00\b/g, "");
  const samePeriod = startTime.slice(-2) === endTime.slice(-2);
  const compactTimeLabel = `${samePeriod ? compactStart.replace(/\s[AP]M$/, "") : compactStart}–${compactEnd}`;
  const [streetAddress, ...addressParts] = event.venue_address.split(",");
  const placementClassName = variant === "hero" ? "tablet:flex-wrap tablet:gap-x-0 tablet:gap-y-[13px] tablet:flex-col tablet:items-start" : "justify-center mobile:-mx-[5px]";

  return (
    <div className={`text-navy mobile:mt-4.25 mobile:justify-center mt-5.5 flex items-center text-left ${placementClassName} ${fullDate ? "mobile:flex-wrap mobile:gap-y-4" : ""}`}>
      <div className={`event-date ${itemClassName} border-border mobile:pl-0 tablet:border-none border-r-2 pl-0`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClassName}>
          <rect x="3" y="5" width="18" height="16" rx="1" />
          <path d="M7 2v6m10-6v6M3 11h18M7 15h3m4 0h3M7 18h3" />
        </svg>
        <p className={titleClassName}>
          {fullDate ? <time dateTime={event.event_date}>{dateLabel}</time> : dateLabel}
          {fullDate ? (
            <span className="mobile:text-[16px] mt-1 block text-[19px]">{timeLabel}</span>
          ) : (
            <time className="mobile:whitespace-nowrap mobile:text-[16px] block text-[22px]" dateTime={event.event_date}>
              {compactTimeLabel}
            </time>
          )}
        </p>
      </div>
      {showAdmission && (
        <div className={`event-location ${itemClassName} border-border tablet:border-none tablet:pl-0 h-[45.8px] border-r-2`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClassName}>
            <g transform="rotate(-45 12 12)">
              <path d="M4 6h16v3a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4V6Z" />
              <path d="M12 7.5v2m0 2v2m0 2v1" />
              <path d="M7 9h2m-2 6h2m6-6h2m-2 6h2" />
            </g>
          </svg>
          <p className={`${titleClassName} mobile:whitespace-nowrap`}>
            {event.admission_mode === "ticketed"
              ? new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: event.currency ?? "usd",
                  maximumFractionDigits: 0,
                }).format((event.price_cents ?? 0) / 100)
              : "FREE.99"}
          </p>
        </div>
      )}
      <div className={`event-location ${itemClassName} mobile:pr-0 pr-0 ${variant === "hero" ? "tablet:basis-full tablet:px-0" : ""}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClassName}>
          <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        <p className={titleClassName}>
          {event.venue_name}
          <span className={descriptionClassName}>
            {streetAddress.trim()}
            <br />
            {addressParts.join(",").trim()}
          </span>
        </p>
      </div>
    </div>
  );
}
