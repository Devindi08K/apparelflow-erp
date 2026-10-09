import type { ReactNode } from "react";
import { Suspense } from "react";
import { requirePageRole } from "@/lib/pageAuth";

async function SupervisorGate({ children }: { children: ReactNode }) {
  await requirePageRole("cutting_supervisor");
  return children;
}

export default function SupervisorLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SupervisorGate>{children}</SupervisorGate>
    </Suspense>
  );
}
