import type { ReactNode } from "react";
import { requirePageRole } from "@/lib/pageAuth";

export default async function VerifierLayout({ children }: { children: ReactNode }) {
  await requirePageRole("cutting_verifier");
  return children;
}
