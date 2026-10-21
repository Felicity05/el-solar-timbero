import "server-only";
import Stripe from "stripe";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) throw new Error("Stripe server key missing");
  if (key.includes("_live_") && !(process.env.STRIPE_LIVE_MODE === "true" && process.env.NODE_ENV === "production")) {
    throw new Error("Live Stripe mode is disabled");
  }
  // The official SDK pins its supported API version. No keys in client bundles.
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 });
}
