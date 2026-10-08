"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getStatus, type TrafficLightStatus } from "@/lib/trafficLight";
import { evaluateApproval, type GatekeeperItem } from "@/lib/gatekeeper";

interface OrderSummary {
  id: string;
  orderNo: string;
  recipeId: string;
  recipeName: string;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: string | number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface VerificationItem {
  id: string;
  componentId: string;
  componentName: string;
  imageUrl: string | null;
  expectedQty: number;
  actualQty: number | null;
  status: TrafficLightStatus | null;
}

interface OrderDetail {
  id: string;
  orderNo: string;
  recipeId: string;
  recipeName: string;
  targetQty: number;
  fabricRollId: string;
  expectedFabricYds: number;
  actualFabricYds: string | number;
  status: string;
  createdAt: string;
  updatedAt: string;
  verificationItems: VerificationItem[];
}

interface ServerErrorBannerData {
  status: number;
  message: string;
  reasons?: string[];
  fieldErrors?: Record<string, string>;
}

function TrafficLightChip({
  status,
  expected,
  actual,
}: {
  status: TrafficLightStatus | "UNCOUNTED" | "INVALID";
  expected?: number;
  actual?: number | null;
}) {
  if (status === "GREEN") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-200 text-green-900 border border-green-300 shadow-sm">
        <svg
          className="w-4 h-4 shrink-0 text-green-800"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span>GREEN • Exact match ({actual}/{expected})</span>
      </span>
    );
  }

  if (status === "YELLOW") {
    const diff = actual !== undefined && actual !== null && expected !== undefined ? actual - expected : 0;
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-200 text-yellow-900 border border-yellow-300 shadow-sm">
        <svg
          className="w-4 h-4 shrink-0 text-yellow-800"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span>YELLOW • Surplus (+{diff} over expected)</span>
      </span>
    );
  }

  if (status === "RED") {
    const diff = actual !== undefined && actual !== null && expected !== undefined ? expected - actual : 0;
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-200 text-red-900 border border-red-300 shadow-sm">
        <svg
          className="w-4 h-4 shrink-0 text-red-800"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>RED • Shortage (-{diff} short)</span>
      </span>
    );
  }

  if (status === "INVALID") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-950 border border-amber-300 shadow-sm">
        <svg
          className="w-4 h-4 shrink-0 text-amber-800"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span>INVALID INPUT</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-800 border border-gray-300 shadow-sm">
      <svg
        className="w-4 h-4 shrink-0 text-gray-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
      <span>PENDING • Uncounted</span>
    </span>
  );
}

export default function VerifierPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Component actual count state: kept strictly as raw TEXT
  const [inputTexts, setInputTexts] = useState<Record<string, string>>({});
  const [inputErrors, setInputErrors] = useState<Record<string, string | null>>({});

  // Operation loading states
  const [savingCounts, setSavingCounts] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  // Reject modal / inline form state
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectNoteError, setRejectNoteError] = useState<string | null>(null);

  // Server error / success banners
  const [serverBanner, setServerBanner] = useState<ServerErrorBannerData | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Fetch queue list
  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch("/api/verify/orders", { cache: "no-store" });
      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorJson.error || `Failed to fetch orders (HTTP ${res.status})`);
      }
      const data = (await res.json()) as { orders: OrderSummary[] };
      setOrders(data.orders || []);
    } catch (err) {
      setServerBanner({
        status: 500,
        message: err instanceof Error ? err.message : "Error loading verification queue",
      });
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Fetch selected order details
  const fetchOrderDetail = useCallback(async (orderId: string) => {
    setLoadingDetail(true);
    setServerBanner(null);
    try {
      const res = await fetch(`/api/verify/${orderId}`, { cache: "no-store" });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errJson.error || `Failed to fetch order details (HTTP ${res.status})`);
      }
      const data = (await res.json()) as { order: OrderDetail };
      setOrderDetail(data.order);

      // Populate initial text state from existing items
      const initialTexts: Record<string, string> = {};
      const initialErrors: Record<string, string | null> = {};
      data.order.verificationItems.forEach((item) => {
        initialTexts[item.componentId] =
          item.actualQty !== null && item.actualQty !== undefined ? String(item.actualQty) : "";
        initialErrors[item.componentId] = null;
      });
      setInputTexts(initialTexts);
      setInputErrors(initialErrors);
    } catch (err) {
      setServerBanner({
        status: 500,
        message: err instanceof Error ? err.message : "Error loading order terminal",
      });
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setShowRejectForm(false);
    setRejectNote("");
    setRejectNoteError(null);
    setSuccessBanner(null);
    fetchOrderDetail(orderId);
  };

  // Text input change handler with strict regex validation /^\d+$/
  const handleInputChange = (componentId: string, value: string) => {
    setInputTexts((prev) => ({ ...prev, [componentId]: value }));

    if (value.trim() === "") {
      setInputErrors((prev) => ({ ...prev, [componentId]: null }));
      return;
    }

    if (!/^\d+$/.test(value)) {
      setInputErrors((prev) => ({
        ...prev,
        [componentId]: "Count must contain digits only (whole non-negative number).",
      }));
      return;
    }

    const numVal = Number(value);
    if (!Number.isSafeInteger(numVal) || numVal > 1000000) {
      setInputErrors((prev) => ({
        ...prev,
        [componentId]: "Count cannot exceed 1,000,000 pieces.",
      }));
      return;
    }

    setInputErrors((prev) => ({ ...prev, [componentId]: null }));
  };

  // Compute live traffic light status for each component
  const getComponentLiveStatus = (
    item: VerificationItem
  ): { status: TrafficLightStatus | "UNCOUNTED" | "INVALID"; actual: number | null } => {
    const raw = inputTexts[item.componentId] ?? "";
    const err = inputErrors[item.componentId];

    if (err) {
      return { status: "INVALID", actual: null };
    }

    if (raw.trim() === "") {
      return { status: "UNCOUNTED", actual: null };
    }

    if (/^\d+$/.test(raw)) {
      const num = Number(raw);
      if (num <= 1000000) {
        return { status: getStatus(item.expectedQty, num), actual: num };
      }
    }

    return { status: "INVALID", actual: null };
  };

  // Client-side Gatekeeper evaluation using evaluateApproval
  const gatekeeperEvaluation = useMemo(() => {
    if (!orderDetail || orderDetail.verificationItems.length === 0) {
      return { canApprove: false, reasons: ["No components loaded"] };
    }

    const gatekeeperItems: GatekeeperItem[] = orderDetail.verificationItems.map((item) => {
      const live = getComponentLiveStatus(item);
      return {
        expectedQty: item.expectedQty,
        actualQty: live.actual,
      };
    });

    return evaluateApproval(gatekeeperItems);
  }, [orderDetail, inputTexts, inputErrors]);

  const hasAnyInputErrors = useMemo(() => {
    return Object.values(inputErrors).some((err) => err !== null);
  }, [inputErrors]);

  // Handle Save Counts (POST /api/verify/[id]/counts)
  const handleSaveCounts = async () => {
    if (!orderDetail || hasAnyInputErrors) return;

    setSavingCounts(true);
    setServerBanner(null);
    setSuccessBanner(null);

    try {
      const countsPayload = orderDetail.verificationItems
        .filter((item) => {
          const raw = inputTexts[item.componentId] ?? "";
          return /^\d+$/.test(raw) && Number(raw) <= 1000000;
        })
        .map((item) => ({
          componentId: item.componentId,
          actualQty: Number(inputTexts[item.componentId]),
        }));

      if (countsPayload.length === 0) {
        setServerBanner({
          status: 422,
          message: "Please enter at least one valid component count before saving.",
        });
        setSavingCounts(false);
        return;
      }

      const res = await fetch(`/api/verify/${orderDetail.id}/counts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counts: countsPayload }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        reasons?: string[];
        items?: VerificationItem[];
        verificationItems?: VerificationItem[];
      };

      if (!res.ok) {
        setServerBanner({
          status: res.status,
          message: data.error || `Failed to save counts (HTTP ${res.status})`,
          reasons: data.reasons,
        });
        return;
      }

      // Server is the single source of truth: update items from server response
      const updatedItems = data.items || data.verificationItems || [];
      if (updatedItems.length > 0) {
        setOrderDetail((prev) => (prev ? { ...prev, verificationItems: updatedItems } : null));

        // Sync text state
        const syncedTexts: Record<string, string> = {};
        const syncedErrors: Record<string, string | null> = {};
        updatedItems.forEach((it) => {
          syncedTexts[it.componentId] =
            it.actualQty !== null && it.actualQty !== undefined ? String(it.actualQty) : "";
          syncedErrors[it.componentId] = null;
        });
        setInputTexts(syncedTexts);
        setInputErrors(syncedErrors);
      }

      setSuccessBanner("Component counts saved successfully! Server verification status synced.");
    } catch (err) {
      setServerBanner({
        status: 500,
        message: err instanceof Error ? err.message : "Failed to save component counts",
      });
    } finally {
      setSavingCounts(false);
    }
  };

  // Handle Approve Batch (POST /api/verify/[id]/approve)
  const handleApproveBatch = async () => {
    if (!orderDetail || !gatekeeperEvaluation.canApprove) return;

    setApproving(true);
    setServerBanner(null);
    setSuccessBanner(null);

    try {
      const res = await fetch(`/api/verify/${orderDetail.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        reasons?: string[];
        errors?: Record<string, string>;
        ok?: boolean;
        order?: { orderNo: string };
      };

      if (!res.ok) {
        setServerBanner({
          status: res.status,
          message: data.error || `Approval blocked (HTTP ${res.status})`,
          reasons: data.reasons,
          fieldErrors: data.errors,
        });
        return;
      }

      const approvedNo = data.order?.orderNo || orderDetail.orderNo;
      setSuccessBanner(`Order ${approvedNo} verified and approved successfully! Transitioned to VERIFIED.`);
      setOrderDetail(null);
      setSelectedOrderId(null);
      await fetchOrders();
    } catch (err) {
      setServerBanner({
        status: 500,
        message: err instanceof Error ? err.message : "Approval request failed",
      });
    } finally {
      setApproving(false);
    }
  };

  // Handle Reject Batch (POST /api/verify/[id]/reject)
  const handleRejectBatch = async () => {
    if (!orderDetail) return;

    const trimmed = rejectNote.trim();
    if (trimmed.length < 5) {
      setRejectNoteError("Rejection note must be at least 5 characters long.");
      return;
    }
    if (trimmed.length > 500) {
      setRejectNoteError("Rejection note cannot exceed 500 characters.");
      return;
    }

    setRejecting(true);
    setRejectNoteError(null);
    setServerBanner(null);
    setSuccessBanner(null);

    try {
      const res = await fetch(`/api/verify/${orderDetail.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: trimmed }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: Record<string, string>;
        ok?: boolean;
        order?: { orderNo: string };
      };

      if (!res.ok) {
        if (data.errors?.note) {
          setRejectNoteError(data.errors.note);
        }
        setServerBanner({
          status: res.status,
          message: data.error || data.errors?.note || `Rejection failed (HTTP ${res.status})`,
          fieldErrors: data.errors,
        });
        return;
      }

      const rejectedNo = data.order?.orderNo || orderDetail.orderNo;
      setSuccessBanner(`Order ${rejectedNo} was rejected. Note logged and status updated to REJECTED.`);
      setShowRejectForm(false);
      setRejectNote("");
      setOrderDetail(null);
      setSelectedOrderId(null);
      await fetchOrders();
    } catch (err) {
      setServerBanner({
        status: 500,
        message: err instanceof Error ? err.message : "Rejection request failed",
      });
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              AF
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Cutting Verifier Terminal
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-900 border border-indigo-200">
                  Role: cutting_verifier
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Server-side gatekeeper verification for cut garment components
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={fetchOrders}
              disabled={loadingOrders}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md border border-slate-300 transition-colors disabled:opacity-50"
            >
              <svg
                className={`w-3.5 h-3.5 ${loadingOrders ? "animate-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh Queue
            </button>
          </div>
        </div>
      </header>

      {/* Global Alerts & Banners */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        {serverBanner && (
          <div
            role="alert"
            className="p-4 mb-4 bg-red-100 border border-red-300 text-red-950 rounded-lg shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-red-700 shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-red-900">
                      HTTP {serverBanner.status} Error:
                    </span>
                    <span className="text-sm text-red-950 font-medium">
                      {serverBanner.message}
                    </span>
                  </div>
                  {serverBanner.reasons && serverBanner.reasons.length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-xs text-red-900 space-y-1 font-medium bg-red-50 p-2.5 rounded border border-red-200">
                      {serverBanner.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                  {serverBanner.fieldErrors && (
                    <div className="mt-2 text-xs text-red-900 font-medium">
                      {Object.entries(serverBanner.fieldErrors).map(([field, msg]) => (
                        <p key={field}>
                          <span className="font-semibold">{field}:</span> {msg}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setServerBanner(null)}
                className="text-red-700 hover:text-red-900 text-sm font-semibold p-1"
                aria-label="Dismiss banner"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {successBanner && (
          <div
            role="status"
            className="p-4 mb-4 bg-emerald-100 border border-emerald-300 text-emerald-950 rounded-lg shadow-sm flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <svg
                className="w-5 h-5 text-emerald-700 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-semibold">{successBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessBanner(null)}
              className="text-emerald-700 hover:text-emerald-900 text-sm font-semibold p-1"
              aria-label="Dismiss banner"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Main Two-Column Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT: Queue List */}
          <section className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Verification Queue
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Orders awaiting quality count check
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                {orders.length} Pending
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[calc(100vh-220px)] overflow-y-auto">
              {loadingOrders ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  <div className="inline-block animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full mb-2"></div>
                  <p>Loading queue orders...</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <svg
                    className="w-10 h-10 mx-auto text-slate-300 mb-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-sm font-medium text-slate-700">No orders in queue</p>
                  <p className="text-xs text-slate-500 mt-1">
                    All cutting batches have been verified or none submitted.
                  </p>
                </div>
              ) : (
                orders.map((o) => {
                  const isSelected = selectedOrderId === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => handleSelectOrder(o.id)}
                      className={`w-full text-left p-4 transition-colors flex flex-col gap-1.5 focus:outline-none focus:bg-indigo-50/50 ${
                        isSelected
                          ? "bg-indigo-50/80 border-l-4 border-indigo-600"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-slate-900">
                          {o.orderNo}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          {new Date(o.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 line-clamp-1">
                        {o.recipeName}
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600 mt-1">
                        <span>Target: <strong className="text-slate-900">{o.targetQty}</strong> pcs</span>
                        <span className="font-mono text-slate-500">Roll: {o.fabricRollId}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* RIGHT: Terminal for Selected Order */}
          <section className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {loadingDetail ? (
              <div className="p-16 text-center text-slate-500">
                <div className="inline-block animate-spin h-8 w-8 border-3 border-indigo-600 border-t-transparent rounded-full mb-3"></div>
                <p className="text-sm font-semibold text-slate-700">
                  Loading order terminal and verification items...
                </p>
              </div>
            ) : !orderDetail ? (
              <div className="p-16 text-center text-slate-500">
                <svg
                  className="w-14 h-14 mx-auto text-slate-300 mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
                <h3 className="text-base font-bold text-slate-800">
                  Select an Order to Verify
                </h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                  Pick an order from the queue on the left to enter component counts and perform traffic-light gatekeeping.
                </p>
              </div>
            ) : (
              <div>
                {/* Order Summary Header */}
                <div className="p-6 bg-slate-50 border-b border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-xl font-bold font-mono text-slate-900">
                          {orderDetail.orderNo}
                        </h2>
                        <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
                          {orderDetail.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-700 mt-1">
                        Recipe: <strong className="text-slate-900">{orderDetail.recipeName}</strong>
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-xs text-slate-500">Target Garments</div>
                      <div className="text-lg font-bold text-slate-900">
                        {orderDetail.targetQty} units
                      </div>
                    </div>
                  </div>

                  {/* Fabric Audit Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-200/80">
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-xs text-slate-500 font-medium">Fabric Roll ID</span>
                      <p className="text-sm font-mono font-bold text-slate-800 mt-0.5">
                        {orderDetail.fabricRollId}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-xs text-slate-500 font-medium">Standard Expected Fabric</span>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">
                        {orderDetail.expectedFabricYds} yds
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-xs text-slate-500 font-medium">Actual Fabric Cut</span>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">
                        {orderDetail.actualFabricYds} yds
                      </p>
                    </div>
                  </div>
                </div>

                {/* Components Table */}
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Cut Component Verification
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Enter counted physical pieces. Status recalculates live on every keystroke.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveCounts}
                      disabled={savingCounts || hasAnyInputErrors}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg shadow-sm text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-50 transition-colors"
                    >
                      {savingCounts ? (
                        <>
                          <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full mr-1"></span>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          Save Counts
                        </>
                      )}
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="min-w-full divide-y divide-slate-200 text-left">
                      <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wider text-slate-700">
                        <tr>
                          <th scope="col" className="px-4 py-3">
                            Component Name
                          </th>
                          <th scope="col" className="px-4 py-3 text-right">
                            Expected
                          </th>
                          <th scope="col" className="px-4 py-3 w-48">
                            Actual Count
                          </th>
                          <th scope="col" className="px-4 py-3">
                            Status (Traffic Light)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm bg-white">
                        {orderDetail.verificationItems.map((item) => {
                          const textVal = inputTexts[item.componentId] ?? "";
                          const errorMsg = inputErrors[item.componentId];
                          const live = getComponentLiveStatus(item);

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="px-4 py-3.5 font-semibold text-slate-900">
                                {item.componentName}
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-800">
                                {item.expectedQty} pcs
                              </td>
                              <td className="px-4 py-3.5">
                                <div>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={textVal}
                                    onChange={(e) => handleInputChange(item.componentId, e.target.value)}
                                    placeholder="Enter count"
                                    className={`w-full px-3 py-1.5 text-sm font-mono font-medium text-gray-900 bg-white rounded-md shadow-2xs transition-colors focus:outline-none focus:ring-2 ${
                                      errorMsg
                                        ? "border-2 border-red-500 focus:ring-red-400 focus:border-red-500 bg-red-50/30"
                                        : "border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500"
                                    }`}
                                  />
                                  {errorMsg && (
                                    <p className="mt-1 text-xs text-red-600 font-semibold flex items-center gap-1">
                                      <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                      </svg>
                                      {errorMsg}
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <TrafficLightChip
                                  status={live.status}
                                  expected={item.expectedQty}
                                  actual={live.actual}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Action Bar (Approve / Reject) */}
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Approve Section & Gatekeeper Status */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <button
                          type="button"
                          onClick={handleApproveBatch}
                          disabled={!gatekeeperEvaluation.canApprove || approving || hasAnyInputErrors}
                          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {approving ? (
                            <>
                              <span className="inline-block animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>
                              Approving...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Approve Batch
                            </>
                          )}
                        </button>

                        {!gatekeeperEvaluation.canApprove && (
                          <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-300 rounded-md text-amber-950 text-xs font-semibold">
                            <svg className="w-4 h-4 text-amber-800 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <span>
                              Approval blocked: {gatekeeperEvaluation.reasons.join(" • ")}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right: Reject Toggle Button */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowRejectForm((prev) => !prev)}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-300 shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                        >
                          <svg className="w-4 h-4 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          {showRejectForm ? "Close Rejection Form" : "Reject Batch"}
                        </button>
                      </div>
                    </div>

                    {/* Reject Form */}
                    {showRejectForm && (
                      <div className="mt-5 p-5 bg-red-50/60 border border-red-200 rounded-xl shadow-xs">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-bold text-red-950 flex items-center gap-1.5">
                            <svg className="w-4 h-4 text-red-700" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            Reject Batch with Mandatory Note
                          </h4>
                          <span className="text-xs text-slate-500 font-mono">
                            {rejectNote.trim().length} / 500 chars (min 5)
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mb-3">
                          Please state the exact defect, shortage, or miscut reason. This note will be recorded permanently in the verification log.
                        </p>
                        <textarea
                          rows={3}
                          value={rejectNote}
                          onChange={(e) => {
                            setRejectNote(e.target.value);
                            if (rejectNoteError && e.target.value.trim().length >= 5) {
                              setRejectNoteError(null);
                            }
                          }}
                          placeholder="e.g. Back Panel cut with severe shortage (10 pieces damaged by dull blade; recut required)"
                          className={`w-full px-3.5 py-2.5 text-sm font-medium text-gray-900 bg-white rounded-lg shadow-2xs transition-colors focus:outline-none focus:ring-2 ${
                            rejectNoteError
                              ? "border-2 border-red-500 focus:ring-red-400 focus:border-red-500"
                              : "border border-gray-300 focus:ring-red-500 focus:border-red-500"
                          }`}
                        />
                        {rejectNoteError && (
                          <p className="mt-1 text-xs text-red-700 font-bold flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {rejectNoteError}
                          </p>
                        )}
                        <div className="mt-4 flex items-center justify-end gap-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              setShowRejectForm(false);
                              setRejectNote("");
                              setRejectNoteError(null);
                            }}
                            className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-md border border-slate-300 shadow-2xs transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleRejectBatch}
                            disabled={rejecting || rejectNote.trim().length < 5}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
                          >
                            {rejecting ? (
                              <>
                                <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full mr-1"></span>
                                Confirming Rejection...
                              </>
                            ) : (
                              "Confirm Rejection"
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
