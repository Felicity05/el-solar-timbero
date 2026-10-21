// Unit-test scheduler only. Production uses Next.js after()/waitUntil.
exports.after = (callback) => globalThis.emailCallbacks.push(callback);
