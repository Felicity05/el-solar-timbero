export function adminAuthConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || key.startsWith("sb_secret_") || /^(sk|rk)_/.test(key)) throw new Error("Admin Auth configuration missing");
  if (key.startsWith("eyJ")) {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    if (payload.role !== "anon") throw new Error("Admin Auth needs a publishable key");
  }
  return { url, key };
}
export function isAdminId(id: string | undefined, configured = process.env.ADMIN_USER_ID) {
  return !!configured && /^[a-f0-9-]{36}$/i.test(configured) && id === configured;
}
