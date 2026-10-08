import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

const sections = [
  {
    role: "cutting_supervisor" as const,
    href: "/supervisor",
    title: "Cutting Supervisor",
    description: "Create cutting orders and send batches for verification.",
    action: "Open supervisor dashboard",
  },
  {
    role: "cutting_verifier" as const,
    href: "/verifier",
    title: "Cutting Verifier",
    description: "Count components, review traffic lights, and approve or reject batches.",
    action: "Open verification terminal",
  },
  {
    role: "sewing_supervisor" as const,
    href: "/sewing",
    title: "Sewing Queue",
    description: "Inspect verified batches and start sewing assembly.",
    action: "Open sewing queue",
  },
];

export default async function Home() {
  const session = await getSessionUser();
  const visibleSections = session
    ? sections.filter((section) => section.role === session.role)
    : sections;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <nav className="border-b border-slate-300 bg-white" aria-label="Section navigation">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2"
          >
            ApparelFlow ERP
          </Link>
          <div className="flex flex-wrap gap-2">
            {visibleSections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2"
              >
                {section.title}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-800">Production control</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">Choose a work area</h1>
          <p className="mt-3 text-lg text-slate-700">
            Move from cutting order creation through verification and into sewing assembly.
          </p>
        </header>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {visibleSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group flex min-h-56 flex-col justify-between rounded-xl border border-slate-300 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2"
            >
              <div>
                <h2 className="text-xl font-bold text-slate-950">{section.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-700">{section.description}</p>
              </div>
              <span className="mt-8 text-sm font-bold text-indigo-800 group-hover:text-indigo-950">
                {section.action} <span aria-hidden="true">-&gt;</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
