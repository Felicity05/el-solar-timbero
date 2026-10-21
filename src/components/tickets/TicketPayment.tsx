import { useRef, useState } from "react";
import type { PaymentStage } from "@/components/tickets/PaymentProcessingOverlay";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

const buttonClass = "print-brush mt-6.5 mx-auto flex min-h-15 w-[60%] cursor-pointer items-center justify-center px-6 py-3 font-heading text-[30px] text-surface disabled:opacity-60";

type PaymentProps = {
  slug: string;
  returnUrl: string;
  onPaid: (received: boolean) => void;
  onProcessing: (stage: PaymentStage | null) => void;
  checkSales: () => Promise<"open" | "closed" | "unavailable">;
  onClosed: () => void;
};

export function TicketPayment({ slug, returnUrl, onPaid, onProcessing, checkSales, onClosed }: PaymentProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!stripe || !elements || inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setError("");
        onProcessing("confirming");
        const confirmed = false;
        try {
          const submitted = await elements.submit();
          if (submitted.error) {
            setError(submitted.error.message ?? "Check your payment details.");
            return;
          }
          const sales = await checkSales();
          if (sales === "closed") {
            onClosed();
            return;
          }
          if (sales !== "open") {
            setError("We couldn’t verify ticket availability. Please try again.");
            return;
          }
          const result = await stripe.confirmPayment({
            elements,
            confirmParams: {
              return_url: `${returnUrl}?event=${encodeURIComponent(slug)}`,
            },
            redirect: "if_required",
          });
          if (result.error) setError(result.error.message ?? "Payment failed. Please try again.");
          else if (["succeeded", "processing"].includes(result.paymentIntent.status)) onPaid(result.paymentIntent.status === "succeeded");
          else setError("Your payment needs another step. Please try again.");
        } catch {
          setError("We couldn’t confirm payment. Check your connection and try again; your order will be reused.");
        } finally {
          inFlight.current = false;
          setBusy(false);
          if (!confirmed) {
            onProcessing(null);
          }
        }
      }}
    >
      <PaymentElement
        options={{
          wallets: { applePay: "never", googlePay: "never", link: "never" },
          layout: { type: "accordion", defaultCollapsed: false },
        }}
        onReady={() => setLoaded(true)}
        onLoadError={() => setError("Payment fields couldn’t load. Please refresh and try again.")}
      />
      <button className={buttonClass} type="submit" disabled={!stripe || !loaded || busy}>
        {busy ? "Confirming your payment…" : "Buy Now"}
      </button>
    </form>
  );
}
