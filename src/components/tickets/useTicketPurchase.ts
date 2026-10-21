"use client";
import { useEffect, useState } from "react";
import { ticketStatus } from "@/app/ticket-actions";
import type { PurchaseStatus } from "@/lib/tickets/types";
import { existingCredential } from "./credential";

export function useTicketPurchase(slug: string, enabled: boolean, stopIfMissing = false) {
  const [purchase, setPurchase] = useState<PurchaseStatus | null>(null);
  const [finished, setFinished] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    async function poll() {
      const credential = existingCredential(slug);
      if (!credential) {
        if (!canceled) {
          setFinished(true);
        }
        return;
      }
      const result = await ticketStatus(slug, credential);
      if (canceled) {
        return;
      }
      if (result) {
        setPurchase(result);
      }
      const ready = result?.status === "paid" && result.ticket_status === "valid" && result.ticket_url && result.ticket_code;
      const unavailable = result && result.status !== "pending" && result.status !== "paid";
      if (ready || unavailable || (!result && stopIfMissing) || ++polls >= 15) {
        setFinished(true);
        return;
      }
      timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [slug, enabled, stopIfMissing, attempt]);
  return {
    purchase,
    finished,
    retry: () => {
      setFinished(false);
      setAttempt((value) => value + 1);
    },
  };
}
