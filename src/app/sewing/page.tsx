"use client";

import { useCallback, useEffect, useState } from "react";

type SewingQueueOrder = {
  id: string;
  orderNo: string;
  recipeName: string;
  targetQty: number;
  fabricRollId: string;
  verifierName: string;
  verifiedAt: string;
  wastagePct: number;
  wastageCap: number;
};

type SewingDetail = {
  id: string;
  orderNo: string;
  recipeName: string;
  targetQty: number;
  fabricRollId: string;
  expectedFabricYds: number;
  actualFabricYds: number;
  status: "VERIFIED" | "SEWING_STARTED";
  verificationItems: Array<{
    componentName: string;
    expectedQty: number;
    actualQty: number | null;
    variance: number | null;
    status: string | null;
  }>;
  approvedVerification: {
    verifierName: string;
    timestamp: string;
    wastagePct: number;
    componentVariances: unknown;
  };
  wastageCap: number;
  wastageExceedsCap: boolean;
};

type Banner = {
  tone: "error" | "success";
  message: string;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string | null): string {
  switch (status) {
    case "GREEN":
      return "GREEN - Exact match";
    case "YELLOW":
      return "YELLOW - Surplus";
    case "RED":
      return "RED - Shortage";
    default:
      return "UNCOUNTED - No count recorded";
  }
}

function StatusChip({ status }: { status: string | null }) {
  const label = statusLabel(status);
  const className =
    status === "GREEN"
      ? "border-emerald-300 bg-emerald-100 text-emerald-950"
      : status === "YELLOW"
        ? "border-amber-300 bg-amber-100 text-amber-950"
        : status === "RED"
          ? "border-red-300 bg-red-100 text-red-950"
          : "border-slate-300 bg-slate-100 text-slate-800";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>
      {label}
    </span>
  );
}

function ErrorBanner({ banner, onDismiss }: { banner: Banner; onDismiss: () => void }) {
  const styles =
    banner.tone === "error"
      ? "border-red-300 bg-red-100 text-red-950"
      : "border-emerald-300 bg-emerald-100 text-emerald-950";

  return (
    <div className={`flex items-start justify-between gap-4 rounded-lg border p-4 ${styles}`} role={banner.tone === "error" ? "alert" : "status"}>
      <p className="text-sm font-semibold">{banner.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded px-2 py-1 text-xs font-bold underline focus:outline-none focus:ring-2 focus:ring-slate-900"
      >
        Dismiss
      </button>
    </div>
  );
}

export default function SewingPage() {
  const [orders, setOrders] = useState<SewingQueueOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SewingDetail | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const response = await fetch("/api/sewing/queue", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        orders?: SewingQueueOrder[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || `Unable to load sewing queue (${response.status})`);
      }
      setOrders(data.orders || []);
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to load sewing queue",
      });
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  const selectOrder = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setDetail(null);
    setBanner(null);
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/sewing/${orderId}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        order?: SewingDetail;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || `Unable to load batch (${response.status})`);
      }
      setDetail(data.order || null);
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to load batch details",
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  const startAssembly = async () => {
    if (!selectedOrderId || starting) return;

    setStarting(true);
    setBanner(null);
    try {
      const response = await fetch(`/api/sewing/${selectedOrderId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setBanner({
          tone: "error",
          message:
            response.status === 409 || response.status === 404
              ? data.error || `Unable to start sewing (${response.status})`
              : data.error || `Unable to start sewing (${response.status})`,
        });
        return;
      }

      setDetail(null);
      setSelectedOrderId(null);
      setConfirmingOrderId(null);
      setBanner({ tone: "success", message: "Sewing assembly started successfully." });
      await fetchQueue();
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to start sewing",
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-800">ApparelFlow ERP</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Sewing Assembly Queue</h1>
            <p className="mt-1 text-sm text-slate-700">Verified cutting batches ready for assembly.</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchQueue()}
            disabled={loadingQueue}
            className="rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
          >
            {loadingQueue ? "Refreshing..." : "Refresh queue"}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {banner && <ErrorBanner banner={banner} onDismiss={() => setBanner(null)} />}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)]">
          <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm" aria-labelledby="queue-heading">
            <div className="flex items-center justify-between border-b border-slate-300 bg-slate-50 px-5 py-4">
              <div>
                <h2 id="queue-heading" className="text-base font-bold">Verified batches</h2>
                <p className="mt-1 text-xs text-slate-700">Select a batch to inspect its audit record.</p>
              </div>
              <span className="rounded-full border border-indigo-300 bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-950">
                {orders.length}
              </span>
            </div>

            {loadingQueue ? (
              <p className="p-8 text-center text-sm font-semibold text-slate-700">Loading verified batches...</p>
            ) : orders.length === 0 ? (
              <p className="p-10 text-center text-sm font-semibold text-slate-800">No verified batches waiting.</p>
            ) : (
              <div className="divide-y divide-slate-200">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => void selectOrder(order.id)}
                    className={`w-full p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-700 ${selectedOrderId === order.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-sm font-bold text-slate-950">{order.orderNo}</span>
                      <span className="text-xs font-semibold text-slate-700">{order.targetQty} pcs</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{order.recipeName}</p>
                    <p className="mt-2 text-xs text-slate-700">Verified {formatDate(order.verifiedAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="min-w-0 rounded-xl border border-slate-300 bg-white shadow-sm" aria-labelledby="detail-heading">
            {loadingDetail ? (
              <p className="p-12 text-center text-sm font-semibold text-slate-700">Loading batch details...</p>
            ) : !detail ? (
              <div className="p-12 text-center">
                <h2 id="detail-heading" className="text-lg font-bold">Select a verified batch</h2>
                <p className="mt-2 text-sm text-slate-700">Its piece counts and fabric audit will appear here.</p>
              </div>
            ) : (
              <div>
                <div className="border-b border-slate-300 bg-slate-50 px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 id="detail-heading" className="font-mono text-xl font-bold">{detail.orderNo}</h2>
                        <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-950">{detail.status}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-800">{detail.recipeName} - {detail.targetQty} garments</p>
                    </div>
                    {confirmingOrderId === detail.id ? (
                      <div className="rounded-lg border border-indigo-300 bg-indigo-50 p-3" role="group" aria-label="Confirm start sewing">
                        <p className="text-sm font-bold text-indigo-950">Start sewing for this batch?</p>
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => void startAssembly()} disabled={starting} className="rounded-md bg-indigo-700 px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-500">
                            {starting ? "Starting..." : "Confirm start"}
                          </button>
                          <button type="button" onClick={() => setConfirmingOrderId(null)} disabled={starting} className="rounded-md border border-slate-400 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmingOrderId(detail.id)} disabled={detail.status !== "VERIFIED" || starting} className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-500">
                        Start Sewing Assembly
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 border-b border-slate-300 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
                  <div className="rounded-lg border border-slate-300 bg-white p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Verifier</p><p className="mt-1 text-sm font-bold">{detail.approvedVerification.verifierName}</p></div>
                  <div className="rounded-lg border border-slate-300 bg-white p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Verified</p><p className="mt-1 text-sm font-bold">{formatDate(detail.approvedVerification.timestamp)}</p></div>
                  <div className="rounded-lg border border-slate-300 bg-white p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Fabric used</p><p className="mt-1 text-sm font-bold">{detail.actualFabricYds.toFixed(2)} yds / {detail.expectedFabricYds.toFixed(2)} yds expected</p></div>
                  <div className={`rounded-lg border p-3 ${detail.wastageExceedsCap ? "border-amber-400 bg-amber-100 text-amber-950" : "border-emerald-300 bg-emerald-100 text-emerald-950"}`}><p className="text-xs font-bold uppercase tracking-wide">Wastage</p><p className="mt-1 text-sm font-bold">{detail.approvedVerification.wastagePct.toFixed(2)}% / {detail.wastageCap.toFixed(2)}% cap</p><p className="mt-1 text-xs font-bold">{detail.wastageExceedsCap ? "ABOVE CAP - Review required" : "Within recipe cap"}</p></div>
                </div>

                <div className="p-5 sm:p-6">
                  <h3 className="text-base font-bold">Piece-count audit</h3>
                  <div className="mt-4 overflow-x-auto rounded-lg border border-slate-300">
                    <table className="min-w-full divide-y divide-slate-300 text-left text-sm">
                      <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-800">
                        <tr><th className="px-4 py-3">Component</th><th className="px-4 py-3 text-right">Expected</th><th className="px-4 py-3 text-right">Actual</th><th className="px-4 py-3 text-right">Variance</th><th className="px-4 py-3">Status</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {detail.verificationItems.map((item) => (
                          <tr key={item.componentName}>
                            <td className="px-4 py-3 font-semibold text-slate-950">{item.componentName}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">{item.expectedQty}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">{item.actualQty ?? "-"}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">{item.variance === null ? "-" : item.variance > 0 ? `+${item.variance}` : item.variance}</td>
                            <td className="px-4 py-3"><StatusChip status={item.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}