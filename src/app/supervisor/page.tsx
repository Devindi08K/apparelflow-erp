"use client";

import { useEffect, useState, useCallback } from "react";

type OrderStatus =
  | "CUTTING_IN_PROGRESS"
  | "PENDING_VERIFICATION"
  | "REJECTED"
  | "VERIFIED"
  | "SEWING_STARTED";

interface CuttingOrderSummary {
  id: string;
  orderNo: string;
  status: OrderStatus;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: string | number;
  createdAt: string;
  updatedAt: string;
  recipeId: string;
  recipeName: string;
  createdByName: string;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const badgeConfig: Record<
    OrderStatus,
    { label: string; className: string }
  > = {
    CUTTING_IN_PROGRESS: {
      label: "Cutting in Progress",
      className: "bg-yellow-200 text-gray-900 border border-yellow-300",
    },
    PENDING_VERIFICATION: {
      label: "Pending Verification",
      className: "bg-blue-200 text-gray-900 border border-blue-300",
    },
    REJECTED: {
      label: "Rejected (Recut Needed)",
      className: "bg-red-200 text-gray-900 border border-red-300",
    },
    VERIFIED: {
      label: "Verified",
      className: "bg-emerald-200 text-gray-900 border border-emerald-300",
    },
    SEWING_STARTED: {
      label: "Sewing Started",
      className: "bg-purple-200 text-gray-900 border border-purple-300",
    },
  };

  const config = badgeConfig[status] || {
    label: status,
    className: "bg-gray-200 text-gray-900 border border-gray-300",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export default function SupervisorPage() {
  const [orders, setOrders] = useState<CuttingOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/orders");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch orders (Status ${response.status})`);
      }
      const data = await response.json();
      setOrders(data.orders || []);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSubmitForVerification = async (orderId: string) => {
    setSubmittingId(orderId);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/orders/${orderId}/submit`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Submission failed with status ${response.status}`);
      }

      await fetchOrders();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to submit order for verification");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Cutting Supervisor Dashboard
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Manage and submit garment cutting orders for quality verification
            </p>
          </div>
          <button
            onClick={fetchOrders}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="p-4 bg-red-100 border border-red-300 text-red-900 rounded-lg flex items-start justify-between shadow-sm"
          >
            <div className="flex items-center gap-3">
              <svg
                className="w-5 h-5 text-red-700 shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-medium">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-700 hover:text-red-900 text-sm font-semibold ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Orders Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Cutting Orders</h2>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full">
              {orders.length} {orders.length === 1 ? "Order" : "Orders"}
            </span>
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="p-12 text-center space-y-3">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-300 border-t-slate-800"></div>
              <p className="text-sm text-slate-600 font-medium">Loading orders...</p>
            </div>
          ) : orders.length === 0 ? (
            /* Empty State */
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-slate-900">No cutting orders found</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                No orders have been registered in the system yet. Once cutting orders are created, they will appear here.
              </p>
            </div>
          ) : (
            /* Orders Table */
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">
                      Order No
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Recipe
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Target Qty
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Fabric Roll
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Created Date
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm bg-white">
                  {orders.map((order) => {
                    const canSubmit =
                      order.status === "CUTTING_IN_PROGRESS" ||
                      order.status === "REJECTED";
                    const isSubmitting = submittingId === order.id;

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium text-slate-900">
                          {order.orderNo}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-800">
                          {order.recipeName}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {order.targetQty} pcs
                        </td>
                        <td className="px-6 py-4 text-slate-700 font-mono text-xs">
                          {order.fabricRollId}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {new Date(order.createdAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {canSubmit ? (
                            <button
                              onClick={() => handleSubmitForVerification(order.id)}
                              disabled={isSubmitting}
                              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                            >
                              {isSubmitting ? (
                                <>
                                  <span className="inline-block animate-spin mr-1.5 h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
                                  Submitting...
                                </>
                              ) : order.status === "REJECTED" ? (
                                "Resubmit for Verification"
                              ) : (
                                "Submit for Verification"
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 italic">
                              Submitted
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
