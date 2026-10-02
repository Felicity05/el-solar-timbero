import BrandPanel from "@/components/event/BrandPanel";
import EventHero from "@/components/event/EventHero";
import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";
import RsvpExperience from "@/components/rsvp/RsvpExperience";
import RsvpResult from "@/components/rsvp/RsvpResult";

export default function Home() {
  return (
    <div className="paper-surface mx-auto w-full overflow-clip border-x border-[#8b572e45]
      shadow-[0_0_60px_#35271935]">
      <a href="#main" className="absolute -top-25 left-4 z-30 bg-surface px-5 py-3">Skip to content</a>
      <SiteHeader />
      <main id="main">
        <RsvpExperience
          hero={<EventHero />}
          aside={<BrandPanel />}
          success={<RsvpResult kind="success" />}
          duplicate={<RsvpResult kind="duplicate" />}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
