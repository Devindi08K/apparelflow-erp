"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  computeExpectedComponents,
  computeExpectedFabric,
  type ExpectedComponent,
} from "@/lib/multiplier";

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

interface RecipeComponent {
  id: string;
  componentName: string;
  piecesPerGarment: number;
}

interface Recipe {
  id: string;
  recipeCode: string;
  name: string;
  category: string;
  stdFabricYards: number | string;
  wastageCap: number | string;
  components: RecipeComponent[];
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

interface NewOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated: () => void;
}

function NewOrderModal({ isOpen, onClose, onOrderCreated }: NewOrderModalProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState<string | null>(null);

  // Form states kept strictly as string text
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [targetQtyStr, setTargetQtyStr] = useState("");
  const [fabricRollId, setFabricRollId] = useState("");
  const [actualFabricYdsStr, setActualFabricYdsStr] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch recipes on modal open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setRecipesLoading(true);
    setRecipesError(null);

    fetch("/api/recipes")
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to fetch recipes");
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setRecipes(data.recipes || []);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setRecipesError(err.message || "Failed to load recipes");
        }
      })
      .finally(() => {
        if (isMounted) {
          setRecipesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Reset form when modal closes/opens
  useEffect(() => {
    if (!isOpen) {
      setSelectedRecipeId("");
      setTargetQtyStr("");
      setFabricRollId("");
      setActualFabricYdsStr("");
      setFieldErrors({});
      setSubmitError(null);
    }
  }, [isOpen]);

  const selectedRecipe = useMemo(() => {
    return recipes.find((r) => r.id === selectedRecipeId) || null;
  }, [recipes, selectedRecipeId]);

  // Inline validation for Target Quantity
  // Text-state validated with regex /^\d+$/ without raw parseInt
  const targetQtyValidation = useMemo(() => {
    if (targetQtyStr === "") {
      return { isValid: false, error: null }; // touched check handled in UI
    }
    if (!/^\d+$/.test(targetQtyStr)) {
      return {
        isValid: false,
        error: "Target quantity must be a whole positive integer",
      };
    }
    const val = Number(targetQtyStr);
    if (val < 1) {
      return { isValid: false, error: "Quantity must be at least 1" };
    }
    if (val > 10000) {
      return { isValid: false, error: "Quantity must be at most 10,000" };
    }
    return { isValid: true, error: null, value: val };
  }, [targetQtyStr]);

  // Inline validation for Fabric Roll ID
  const fabricRollValidation = useMemo(() => {
    if (fabricRollId === "") {
      return { isValid: false, error: null };
    }
    const trimmed = fabricRollId.trim();
    if (trimmed.length < 3) {
      return { isValid: false, error: "Fabric roll ID must be at least 3 characters" };
    }
    if (trimmed.length > 40) {
      return { isValid: false, error: "Fabric roll ID must be at most 40 characters" };
    }
    if (!/^[A-Za-z0-9-]+$/.test(trimmed)) {
      return {
        isValid: false,
        error: "Fabric roll ID may only contain letters, numbers, and hyphens",
      };
    }
    return { isValid: true, error: null };
  }, [fabricRollId]);

  // Inline validation for Actual Fabric Yards
  const actualFabricValidation = useMemo(() => {
    if (actualFabricYdsStr === "") {
      return { isValid: false, error: null };
    }
    if (!/^\d+(\.\d{1,2})?$/.test(actualFabricYdsStr)) {
      return {
        isValid: false,
        error: "Actual fabric must be a valid number with at most 2 decimal places",
      };
    }
    const val = Number(actualFabricYdsStr);
    if (val <= 0) {
      return { isValid: false, error: "Fabric yards must be greater than 0" };
    }
    if (val > 100000) {
      return { isValid: false, error: "Fabric yards must be at most 100,000" };
    }
    return { isValid: true, error: null, value: val };
  }, [actualFabricYdsStr]);

  // Live preview calculation via lib/multiplier.ts
  const previewData = useMemo<{
    components: ExpectedComponent[];
    expectedFabric: number;
  } | null>(() => {
    if (!selectedRecipe || !targetQtyValidation.isValid || !targetQtyValidation.value) {
      return null;
    }

    const qty = targetQtyValidation.value;
    const components = computeExpectedComponents(qty, selectedRecipe.components);
    const expectedFabric = computeExpectedFabric(
      qty,
      Number(selectedRecipe.stdFabricYards),
    );

    return {
      components,
      expectedFabric,
    };
  }, [selectedRecipe, targetQtyValidation]);

  // Overall form validity
  const isFormValid =
    Boolean(selectedRecipeId) &&
    targetQtyValidation.isValid &&
    fabricRollValidation.isValid &&
    actualFabricValidation.isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || !targetQtyValidation.value || !actualFabricValidation.value) {
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setSubmitError(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipeId: selectedRecipeId,
          targetQty: targetQtyValidation.value,
          fabricRollId: fabricRollId.trim(),
          actualFabricYds: actualFabricValidation.value,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 422 && data.errors) {
          // Map server 422 errors directly to matching fields
          setFieldErrors(data.errors);
          if (data.errors._form) {
            setSubmitError(data.errors._form);
          }
          return;
        }
        throw new Error(data.error || `Order creation failed (Status ${response.status})`);
      }

      // Success
      onOrderCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create cutting order");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-900 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 id="modal-title" className="text-xl font-bold text-slate-900">
              New Cutting Order
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Initiate a garment cutting batch with automatic expected multiplier stubs
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <span className="sr-only">Close</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {submitError && (
            <div
              role="alert"
              className="p-3.5 bg-red-100 border border-red-300 text-red-900 rounded-lg text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-red-700 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{submitError}</span>
            </div>
          )}

          {recipesError && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-900 rounded-lg text-xs">
              {recipesError}
            </div>
          )}

          {/* 1. Recipe Select */}
          <div>
            <label htmlFor="recipe-select" className="block text-sm font-semibold text-slate-900 mb-1">
              Garment Recipe <span className="text-red-600">*</span>
            </label>
            <select
              id="recipe-select"
              value={selectedRecipeId}
              onChange={(e) => {
                setSelectedRecipeId(e.target.value);
                if (fieldErrors.recipeId) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.recipeId;
                    return next;
                  });
                }
              }}
              disabled={recipesLoading}
              className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow disabled:bg-slate-100"
            >
              <option value="" className="bg-white text-slate-900">
                {recipesLoading ? "Loading recipes..." : "-- Select a recipe --"}
              </option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id} className="bg-white text-slate-900">
                  {r.recipeCode} — {r.name} ({r.category})
                </option>
              ))}
            </select>
            {fieldErrors.recipeId && (
              <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.recipeId}</p>
            )}
          </div>

          {/* 2. Target Batch Quantity */}
          <div>
            <label htmlFor="target-qty" className="block text-sm font-semibold text-slate-900 mb-1">
              Target Batch Quantity (pcs) <span className="text-red-600">*</span>
            </label>
            <input
              id="target-qty"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 50"
              value={targetQtyStr}
              onChange={(e) => {
                setTargetQtyStr(e.target.value);
                if (fieldErrors.targetQty) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.targetQty;
                    return next;
                  });
                }
              }}
              className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
            />
            {targetQtyValidation.error && (
              <p className="text-xs text-red-600 font-medium mt-1">{targetQtyValidation.error}</p>
            )}
            {fieldErrors.targetQty && (
              <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.targetQty}</p>
            )}
          </div>

          {/* 3. Fabric Roll ID */}
          <div>
            <label htmlFor="fabric-roll-id" className="block text-sm font-semibold text-slate-900 mb-1">
              Fabric Roll ID <span className="text-red-600">*</span>
            </label>
            <input
              id="fabric-roll-id"
              type="text"
              placeholder="e.g. FAB-ROLL-882"
              value={fabricRollId}
              onChange={(e) => {
                setFabricRollId(e.target.value);
                if (fieldErrors.fabricRollId) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.fabricRollId;
                    return next;
                  });
                }
              }}
              className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
            />
            {fabricRollValidation.error && (
              <p className="text-xs text-red-600 font-medium mt-1">{fabricRollValidation.error}</p>
            )}
            {fieldErrors.fabricRollId && (
              <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.fabricRollId}</p>
            )}
          </div>

          {/* 4. Actual Fabric Used (yards) */}
          <div>
            <label htmlFor="actual-fabric" className="block text-sm font-semibold text-slate-900 mb-1">
              Actual Fabric Used (yards) <span className="text-red-600">*</span>
            </label>
            <input
              id="actual-fabric"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 95.50"
              value={actualFabricYdsStr}
              onChange={(e) => {
                setActualFabricYdsStr(e.target.value);
                if (fieldErrors.actualFabricYds) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.actualFabricYds;
                    return next;
                  });
                }
              }}
              className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
            />
            {actualFabricValidation.error && (
              <p className="text-xs text-red-600 font-medium mt-1">{actualFabricValidation.error}</p>
            )}
            {fieldErrors.actualFabricYds && (
              <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.actualFabricYds}</p>
            )}
          </div>

          {/* Live Preview Panel */}
          {previewData ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Live Multiplier Preview
                </h4>
                <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                  Std: {Number(selectedRecipe?.stdFabricYards)} yds/pc | Cap: {Number(selectedRecipe?.wastageCap)}%
                </span>
              </div>

              {/* Expected Fabric Yards */}
              <div className="flex items-center justify-between text-sm py-1 bg-white px-3 rounded-lg border border-slate-200">
                <span className="text-slate-600 font-medium">Expected Standard Fabric:</span>
                <span className="font-bold text-slate-900">
                  {previewData.expectedFabric.toFixed(2)} yards
                </span>
              </div>

              {/* Components Breakdown Table */}
              <div>
                <span className="text-xs font-medium text-slate-600 block mb-1.5">
                  Expected Component Pieces ({previewData.components.length} components):
                </span>
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Component</th>
                        <th className="px-3 py-2 text-center">Pieces / Garment</th>
                        <th className="px-3 py-2 text-right">Expected Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {previewData.components.map((c) => {
                        const originalComp = selectedRecipe?.components.find(
                          (rc) => rc.id === c.componentId,
                        );
                        return (
                          <tr key={c.componentId} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium">{c.componentName}</td>
                            <td className="px-3 py-2 text-center text-slate-600">
                              {originalComp?.piecesPerGarment || 1}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-indigo-900">
                              {c.expectedQty.toLocaleString()} pcs
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
              Select a recipe and enter a valid batch quantity to view the live component multiplier preview.
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <>
                  <span className="inline-block animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                  Creating Order...
                </>
              ) : (
                "Create Cutting Order"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SupervisorPage() {
  const [orders, setOrders] = useState<CuttingOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Cutting Supervisor Dashboard
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Manage and submit garment cutting orders for quality verification
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchOrders}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Cutting Order
            </button>
          </div>
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
              type="button"
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
                No orders have been registered in the system yet. Click &quot;New Cutting Order&quot; above to create one.
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
                              type="button"
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

      {/* New Order Modal */}
      <NewOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onOrderCreated={fetchOrders}
      />
    </div>
  );
}
