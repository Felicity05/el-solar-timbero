"use client";
import { useEffect, useRef, useState } from "react";
import type QrScanner from "qr-scanner";
import type { DoorResult } from "@/lib/check-in/server";
import { invalidDoorMessages } from "@/lib/check-in/invalid-reasons";
import { admitDoorTicket, lockDoor, unlockDoor, validateDoorTicket } from "@/app/check-in/actions";
import { controlClassName, labelClassName } from "../shared/form-styles";

export default function DoorCheckIn({ initialAuthenticated }: { initialAuthenticated: boolean }) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<DoorResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScanner | null>(null);
  const credential = useRef("");
  const working = useRef(false);
  const button = "min-h-12 rounded border border-navy bg-navy px-5 py-3 font-bold text-surface disabled:opacity-50 mr-2";

  async function validate(value: string) {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setCamera(false);
    scanner.current?.stop();
    credential.current = value;
    setMessage("");
    try {
      const response = await validateDoorTicket(value);
      if (response.status === "unauthorized") {
        setAuthenticated(false);
      }
      setResult(response);
    } catch {
      setMessage("Unable to validate. Please try again.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!camera || !authenticated) {
      return;
    }
    let disposed = false;
    let instance: QrScanner | undefined;
    void import("qr-scanner")
      .then(async ({ default: Scanner }) => {
        if (disposed || !video.current) {
          return;
        }
        instance = new Scanner(
          video.current,
          ({ data }) => {
            void validate(data);
          },
          { preferredCamera: "environment", returnDetailedScanResult: true, maxScansPerSecond: 5 },
        );
        scanner.current = instance;
        await instance.start();
        if (disposed) {
          instance.destroy();
        }
      })
      .catch(() => {
        if (!disposed) {
          setMessage("Camera unavailable. Allow camera access on HTTPS, or enter the ticket code below.");
          setCamera(false);
        }
      });
    return () => {
      disposed = true;
      instance?.destroy();
      scanner.current = null;
    };
  }, [camera, authenticated]);

  //todo: figure out which kind of event is needed here
  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await unlockDoor(pin);
      setPin("");
      setShowPin(false);
      if (response.status === "ok") {
        credential.current = "";
        setResult(null);
        setCode("");
        setAuthenticated(true);
      } else {
        setMessage(response.message ?? "Unable to unlock scanner.");
      }
    } catch {
      setMessage("Unable to unlock scanner. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function admit() {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    try {
      const response = await admitDoorTicket(credential.current);
      if (response.status === "unauthorized") {
        setAuthenticated(false);
      }
      setResult(response);
    } catch {
      setMessage("Unable to check in. Validate this ticket again before retrying.");
      setResult(null);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function next() {
    credential.current = "";
    setCode("");
    setResult(null);
    setMessage("");
    setCamera(true);
  }

  const ticket = result && "ticket_code" in result ? result : null;

  const statusUi = {
    valid: {
      label: "VALID TICKET",
      color: "bg-sky-100 border-navy text-sky-950",
    },
    checked_in: {
      label: "CHECKED IN ✓",
      color: "bg-green-100 border-green-800 text-green-950",
    },
    already_checked_in: {
      label: "ALREADY CHECKED IN",
      color: "bg-amber-100 border-amber-800 text-amber-950",
    },
    invalid: {
      label: "INVALID TICKET",
      color: "bg-red-100 border-red-700 text-red-950",
    },
    error: {
      label: "ERROR",
      color: "bg-red-100 border-red-700 text-red-950",
    },
    unauthorized: {
      label: "UNAUTHORIZED",
      color: "bg-red-100 border-red-700 text-red-950",
    },
  } as const;

  const currentStatus = result ? statusUi[result.status] : null;

  return (
    <main className="paper-surface text-navy min-h-screen px-5 py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <header className="text-center">
          <p className="font-heading text-3xl">EL SOLAR TIMBERO</p>
          <h1 className="font-heading mt-3 text-4xl">DOOR CHECK-IN</h1>
        </header>
        {!authenticated ? (
          <form onSubmit={login} className="space-y-4">
            <label className={labelClassName} htmlFor="door-pin">
              Staff PIN
            </label>
            <div className="relative">
              <input id="door-pin" type={showPin ? "text" : "password"} inputMode="numeric" autoComplete="off" required maxLength={12} className={`${controlClassName} pr-14`} value={pin} onChange={(e) => setPin(e.target.value)} />
              <button
                type="button"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
                aria-pressed={showPin}
                aria-controls="door-pin"
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-[7px] text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                onClick={() => setShowPin((visible) => !visible)}
              >
                <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  {showPin ? <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></> : <><path d="M3 9c2 4 5 6 9 6s7-2 9-6M5 12l-2 3m6-1-1 4m7-4 1 4m3-6 2 3" /></>}
                </svg>
              </button>
            </div>
            <button className={button} disabled={busy}>
              Unlock Scanner
            </button>
          </form>
        ) : (
          <>
            <button
              className="text-primary inline-flex items-center gap-2 text-[18px] font-bold underline disabled:opacity-50"
              disabled={busy}
              onClick={async () => {
                setCamera(false);
                await lockDoor();
                setAuthenticated(false);
                setResult(null);
                credential.current = "";
              }}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
                <path d="M7 11h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h1Z" />
                <path d="M16 11V7a4 4 0 0 0-7.65-1.62" />
                <path d="M12 15v2" />
              </svg>
              Lock Scanner
            </button>
            {!result && (
              <>
                <p>
                  Scan a ticket to validate it. <span className="text-[18px] font-semibold">Admission requires pressing Check In.</span>
                </p>
                <button
                  className={button}
                  disabled={busy || camera}
                  onClick={() => {
                    setMessage("");
                    setCamera(true);
                  }}
                >
                  Start Camera
                </button>
                <button
                  className={button}
                  disabled={!camera}
                  onClick={() => {
                    setMessage("");
                    setCamera(false);
                  }}
                >
                  Close Camera
                </button>
                <video ref={video} muted playsInline hidden={!camera} className="bg-navy aspect-square w-full rounded-lg object-cover" aria-label="Ticket QR camera" />
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void validate(code);
                  }}
                >
                  <label htmlFor="ticket-code" className={labelClassName}>
                    Or enter ticket code
                  </label>
                  <input
                    id="ticket-code"
                    className={controlClassName}
                    autoComplete="off"
                    placeholder="EST-XXXXXXXXXXXX"
                    maxLength={16}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <button className={button} disabled={busy}>
                    Validate Ticket
                  </button>
                </form>
              </>
            )}
            {result && (
              <section aria-live="polite">
                <div className={`mb-5 space-y-5 rounded-lg border-4 p-6 text-center ${currentStatus!.color}`}>
                  <h2 className="font-heading text-4xl">{currentStatus!.label}</h2>
                  {result.status === "error" && <p role="alert">{result.message}</p>}
                  {result.status === "invalid" && <p>{invalidDoorMessages[result.reason]}</p>}
                  {ticket && (
                    <>
                      <p className="text-xl font-bold">{ticket.ticket_code}</p>
                      <p>{ticket.ticket_type}</p>
                      <p>{ticket.event_name}</p>

                      {ticket.checked_in_at && (
                        <p>
                          {" "}
                          Checked in:{" "}
                          {new Intl.DateTimeFormat("en-US", {
                            timeZone: ticket.timezone,
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(ticket.checked_in_at))}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="m-4 flex justify-center gap-3 align-middle">
                  {result.status === "valid" && (
                    <button className={button} disabled={busy} onClick={admit}>
                      Check In
                    </button>
                  )}
                  <button className={button} disabled={busy} onClick={next}>
                    Scan Next
                  </button>
                </div>
              </section>
            )}
          </>
        )}
        {busy && <p role="status">Please wait…</p>}
        {message && (
          <p role="alert" className="text-primary">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
