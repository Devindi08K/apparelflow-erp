import type { ReactNode } from "react";
import { requirePageRole } from "@/lib/pageAuth";

export default async function SewingLayout({ children }: { children: ReactNode }) {
  await requirePageRole("sewing_supervisor");
  return children;
}
