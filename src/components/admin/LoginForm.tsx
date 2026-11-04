"use client";
import { useActionState } from "react";
import { loginAdmin } from "../../app/admin/actions";
import { controlClassName, labelClassName } from "../shared/form-styles";
export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAdmin, {});
  return (
    <form action={action} className="mx-auto max-w-md space-y-5">
      <h1 className="font-heading text-4xl">Admin sign in</h1>
      <p>Private access for the El Solar Timbero organizer.</p>
      <label className={labelClassName}>
        Email
        <input name="email" type="email" autoComplete="username" required className={controlClassName} />
      </label>
      <label className={labelClassName}>
        Password
        <input name="password" type="password" autoComplete="current-password" required className={controlClassName} />
      </label>
      {state.error && (
        <p role="alert" className="text-primary">
          {state.error}
        </p>
      )}
      <button className="bg-navy text-surface rounded px-6 py-3 disabled:opacity-50" disabled={pending}>
        {pending ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}
