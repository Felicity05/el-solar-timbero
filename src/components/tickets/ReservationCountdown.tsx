"use client";
import { useEffect, useState } from "react";

export default function ReservationCountdown({ expiresAt, active, onExpired }: { expiresAt: string; active: boolean; onExpired: () => void }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0 && active) onExpired();
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [expiresAt, active, onExpired]);
  const clock = seconds === null ? "--:--" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <p className="text-primary text-md mb-4 px-4 py-3 text-center font-bold">
      Ticket reserved for{" "}
      <span role="timer" aria-label="Checkout time remaining" className="tabular-nums">
        {clock}
      </span>
    </p>
  );
}
