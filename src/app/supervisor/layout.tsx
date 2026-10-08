import type { ReactNode } from "react";
import { requirePageRole } from "@/lib/pageAuth";

export default async function SupervisorLayout({ children }: { children: ReactNode }) {
  await requirePageRole("cutting_supervisor");
  return children;
}
