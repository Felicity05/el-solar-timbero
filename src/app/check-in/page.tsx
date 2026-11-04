import type { Metadata } from "next";
import DoorCheckIn from "../../components/check-in/DoorCheckIn";
import { doorAuthenticated, doorConfig } from "@/lib/check-in/server";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Door Check-In | El Solar Timbero", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function CheckInPage() {
  let authenticated = false;
  try {
    authenticated = await doorAuthenticated(await doorConfig());
  } catch {
    return (
      <main className="paper-surface text-navy min-h-screen p-8 text-center">
        <h1 className="font-heading text-4xl">Door check-in is unavailable</h1>
        <p>No active event has a door PIN available. Please ask the organizer to check Admin.</p>
      </main>
    );
  }
  return <DoorCheckIn initialAuthenticated={authenticated} />;
}
