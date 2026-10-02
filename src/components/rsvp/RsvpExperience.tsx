"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { submitRsvp } from "@/app/actions";
import RsvpForm from "./RsvpForm";
import { type RsvpState } from "@/lib/rsvp";

const initialState: RsvpState = { status: "idle" };

type RsvpExperienceProps = {
  hero: ReactNode;
  aside: ReactNode;
  success: ReactNode;
  duplicate: ReactNode;
};

// Server-rendered sections arrive as slots; only submission state needs client JavaScript.
export default function RsvpExperience({ hero, aside, success, duplicate }: RsvpExperienceProps) {
  const [state, formAction, pending] = useActionState(submitRsvp, initialState);
  const container = useRef<HTMLDivElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "success" || state.status === "duplicate") {
      container.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    } else if (state.status === "error") {
      errorSummary.current?.focus();
    }
  }, [state]);

  if (state.status === "success" || state.status === "duplicate") {
    return <div ref={container}>{state.status === "success" ? success : duplicate}</div>;
  }

  return (
    <div ref={container}>
      {hero}
      <div className="relative grid grid-cols-[minmax(0,1fr)_310px] gap-13.5 px-16
        pt-8 pb-15
        tablet:grid-cols-[minmax(0,1fr)_220px] tablet:gap-7.5 tablet:px-7.5 tablet:py-10.5
        mobile:block mobile:px-5 mobile:pt-5 mobile:pb-7.5 narrow:px-4">

        <RsvpForm
          state={state}
          formAction={formAction}
          pending={pending}
          errorSummaryRef={errorSummary}
        />
        {aside}
      </div>
    </div>
  );
}
