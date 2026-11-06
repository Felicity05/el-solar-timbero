// TEST PROCESS ONLY. Official Stripe SDK requests with the exact dummy key are
// redirected to the local fixture server. Production code has no mock switch.
import https from "node:https";
import http from "node:http";
import { syncBuiltinESMExports } from "node:module";
const original = https.request;
https.request = function (options, ...args) {
  if (options?.host !== "api.stripe.com") return original.call(this, options, ...args);
  if (options.headers?.Authorization !== "Bearer sk_test_fixture" && options.headers?.authorization !== "Bearer sk_test_fixture") {
    throw new Error("Test harness refuses non-fixture Stripe credentials");
  }
  return http.request(
    {
      host: "127.0.0.1",
      port: 54329,
      path: `/mock-stripe${options.path}`,
      method: options.method,
      headers: { ...options.headers, Authorization: "Bearer fixture-only" },
      agent: false,
    },
    ...args,
  );
};
syncBuiltinESMExports();

// SMTP is stubbed in this test-only process. Never send browser-fixture mail.
import nodemailer from "nodemailer";
nodemailer.createTransport = () => ({
  sendMail: async (message) => {
    const address = message.to?.address;
    if (address === "failure@example.com") throw new Error("Fixture SMTP unavailable");
    return { accepted: [address], rejected: [] };
  },
});
