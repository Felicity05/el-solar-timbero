import BrandPanel from "@/components/event/BrandPanel";
import EventHero from "@/components/event/EventHero";
import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";
import RsvpExperience from "@/components/rsvp/RsvpExperience";
import RsvpResult from "@/components/rsvp/RsvpResult";
import RsvpClosed from "@/components/rsvp/RsvpClosed";
import { getCurrentRsvpEvent } from "@/lib/rsvp-event";

export const dynamic = "force-dynamic";

export default async function Home() {
  const event = await getCurrentRsvpEvent();
  return (
    <div className="paper-surface mx-auto w-full overflow-clip border-x border-[#8b572e45]
      shadow-[0_0_60px_#35271935]">
      <a href="#main" className="absolute -top-25 left-4 z-30 bg-surface px-5 py-3">Skip to content</a>
      <SiteHeader />
      <main id="main">
        {event?.open ? <RsvpExperience
          disclaimerVersion={event.disclaimer_version}
          hero={<EventHero event={event} />}
          aside={<BrandPanel />}
          success={<RsvpResult kind="success" event={event} />}
          duplicate={<RsvpResult kind="duplicate" event={event} />}
        /> : <RsvpClosed />}
      </main>
      <SiteFooter />
    </div>
  );
}
