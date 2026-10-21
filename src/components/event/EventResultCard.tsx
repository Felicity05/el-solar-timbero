import type { ReactNode } from "react";
import EventDetails, { type EventDetailsData } from "./EventDetails";

type EventResultCardProps = {
  name: string;
  event: EventDetailsData;
  fullDate?: boolean;
  showAdmission?: boolean;
  children?: ReactNode;
};

export default function EventResultCard({ name, event, fullDate = false, showAdmission = true, children }: EventResultCardProps) {
  return (
    <div className="paper-surface mobile:mt-6.25 mobile:px-0 mobile:pt-4.5 mx-auto mt-7.5 mb-15 justify-center rounded-md px-3.75 py-5 text-center">
      <h2 className="font-heading text-navy mobile:text-[31px] text-[40px] leading-[1.1] uppercase">{name}</h2>
      <p className="font-heading text-navy mobile:text-[16px] text-[20px] tracking-[.06em] uppercase" lang="es">
        Música <span className="text-primary">★</span> Baile <span className="text-primary">★</span> Comunidad
      </p>
      <EventDetails event={event} variant="result" fullDate={fullDate} showAdmission={showAdmission} />
      {children}
    </div>
  );
}
