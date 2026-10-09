import type { ReactNode } from "react";
import { Suspense } from "react";
import { requirePageRole } from "@/lib/pageAuth";

async function SewingGate({ children }: { children: ReactNode }) {
  await requirePageRole("sewing_supervisor");
  return children;
}

export default function SewingLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SewingGate>{children}</SewingGate>
    </Suspense>
  );
}
