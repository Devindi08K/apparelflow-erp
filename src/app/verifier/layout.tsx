import type { ReactNode } from "react";
import { Suspense } from "react";
import { requirePageRole } from "@/lib/pageAuth";

async function VerifierGate({ children }: { children: ReactNode }) {
  await requirePageRole("cutting_verifier");
  return children;
}

export default function VerifierLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <VerifierGate>{children}</VerifierGate>
    </Suspense>
  );
}
