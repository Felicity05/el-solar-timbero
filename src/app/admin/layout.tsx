import type { ReactNode } from "react";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Admin | El Solar Timbero", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="paper-surface text-navy min-h-dvh px-5 py-8">
      <div className="mx-auto max-w-5xl">
        <p className="font-heading mb-8 text-3xl">EL SOLAR TIMBERO · ADMIN</p>
        {children}
      </div>
    </main>
  );
}
