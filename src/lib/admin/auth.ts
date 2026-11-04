import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuthConfig, isAdminId } from "./auth-config";

export async function adminAuthClient() {
  const store = await cookies();
  const { url, key } = adminAuthConfig();
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* Read-only Server Component; proxy refreshes the cookies. */
        }
      },
    },
  });
}
export async function currentAdmin() {
  const client = await adminAuthClient();
  // Verify against Supabase Auth; never authorize from getSession or editable metadata.
  const { data, error } = await client.auth.getUser();
  return !error && isAdminId(data.user?.id) ? data.user : null;
}
export async function requireAdmin() {
  const user = await currentAdmin();
  if (!user) redirect("/admin");
  return user;
}
