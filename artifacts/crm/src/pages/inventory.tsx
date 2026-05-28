import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInventoryPools,
  useListInventoryStock,
  useListInventoryMovements,
  useUpsertInventoryStock,
  useAdjustInventory,
  getListInventoryStockQueryKey,
  getListInventoryMovementsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Package, History, Search, ChevronDown, Edit2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateInventoryStatus, invStatusBadgeClass } from "@/lib/inventoryStatus";

function stockBadge(available: number, reserved: number) {
  const { status, label } = calculateInventoryStatus(available, reserved);
  const cls = invStatusBadgeClass(status);
  const short = status === "out_of_stock" ? "Out"
    : status === "low_stock" ? "Low"
    : status === "not_allocated" ? "N/A"
    : "OK";
  return (
    <Badge className={`${cls} text-[10px] px-1.5 py-0`} title={label}>
      {short}
    </Badge>
  );
}

function reasonLabel(reason: string) {
  switch (reason) {
    case "order_reserved":           return "Reserved for order";
    case "order_cancelled_released": return "Released (cancelled)";
    case "order_fulfilled":          return "Fulfilled (accounting approved)";
    case "manual_set":               return "Manual set";
    default:                         return reason.replace(/_/g, " ");
  }
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const [search, setSearch]           = useState("");
  const [expandedId, setExpandedId]   = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen]     = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [movementsOpen, setMovementsOpen]       = useState(false);
  const [selectedProduct, setSelectedProduct]   = useState<any>(null);
  const [selectedPoolId, setSelectedPoolId]     = useState<string>("");
  const [editQty, setEditQty]         = useState("0");
  const [adjustDelta, setAdjustDelta] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");

  const { data: pools }    = useListInventoryPools();
  const { data: stock, isLoading } = useListInventoryStock();
  const { data: movements } = useListInventoryMovements({ limit: 50 });

  const upsert = useUpsertInventoryStock({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInventoryStockQueryKey() });
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
        toast({ title: "Stock updated" });
        setEditDialogOpen(false);
      },
      onError: (e: any) =>
        toast({ title: "Failed to update stock", description: e?.message, variant: "destructive" }),
    },
  });

  const adjust = useAdjustInventory({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInventoryStockQueryKey() });
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
        toast({ title: "Stock adjusted" });
        setAdjustDialogOpen(false);
        setAdjustDelta("0");
        setAdjustReason("");
      },
      onError: (e: any) =>
        toast({ title: "Failed to adjust stock", description: e?.message, variant: "destructive" }),
    },
  });

  const filtered = (stock ?? []).filter((p: any) =>
    !search ||
    p.productName.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  function toggleExpand(productId: number) {
    setExpandedId(prev => (prev === productId ? null : productId));
  }

  function openEdit(e: React.MouseEvent, product: any, poolId: number) {
    e.stopPropagation();
    const poolRow = product.pools.find((p: any) => p.poolId === poolId);
    setSelectedProduct(product);
    setSelectedPoolId(String(poolId));
    setEditQty(String(poolRow?.quantityAvailable ?? 0));
    setEditDialogOpen(true);
  }

  function openAdjust(e: React.MouseEvent, product: any, poolId: number) {
    e.stopPropagation();
    setSelectedProduct(product);
    setSelectedPoolId(String(poolId));
    setAdjustDelta("0");
    setAdjustReason("");
    setAdjustDialogOpen(true);
  }

  function submitSet() {
    if (!selectedProduct || !selectedPoolId) return;
    upsert.mutate({
      data: {
        productId: selectedProduct.productId,
        poolId: Number(selectedPoolId),
        quantityAvailable: Number(editQty),
      },
    });
  }

  function submitAdjust() {
    if (!selectedProduct || !selectedPoolId || !adjustReason.trim()) {
      toast({ title: "Reason is required", variant: "destructive" });
      return;
    }
    adjust.mutate({
      data: {
        productId: selectedProduct.productId,
        poolId: Number(selectedPoolId),
        delta: Number(adjustDelta),
        reason: adjustReason.trim(),
      },
    });
  }

  const selectedPoolRow = selectedProduct?.pools?.find(
    (p: any) => p.poolId === Number(selectedPoolId)
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground text-sm">
            Click a product row to see per-pool stock details
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMovementsOpen(true)}>
          <History className="h-4 w-4 mr-1.5" />Movement Log
        </Button>
      </div>

      {/* Pool legend */}
      {(pools ?? []).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(pools ?? []).map((pool: any) => (
            <span key={pool.id} className="inline-flex items-center gap-1.5 text-xs bg-muted/40 border rounded px-2.5 py-1 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary/50 shrink-0" />
              <span className="font-medium">{pool.label}</span>
              <span className="opacity-50">·</span>
              <span className="font-mono opacity-60">{pool.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or SKU…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading / empty */}
      {isLoading && (
        <p className="text-center py-8 text-muted-foreground text-sm">Loading…</p>
      )}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p>No products found</p>
        </div>
      )}

      {/* Product list */}
      <div className="border rounded-lg divide-y overflow-hidden">
        {filtered.map((product: any) => {
          const isOpen = expandedId === product.productId;
          const totalAvailable = product.pools.reduce((s: number, p: any) => s + p.quantityAvailable, 0);
          const totalReserved  = product.pools.reduce((s: number, p: any) => s + p.quantityReserved, 0);

          return (
            <div key={product.productId}>
              {/* Clickable product row */}
              <button
                type="button"
                onClick={() => toggleExpand(product.productId)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
                  "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isOpen && "bg-muted/20"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{product.productName}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{product.sku}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 ml-3">
                  {/* Summary totals — only shown when row is collapsed */}
                  {!isOpen && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        <span className="font-semibold text-foreground">{totalAvailable}</span> avail
                      </span>
                      {totalReserved > 0 && (
                        <span className="text-amber-700">
                          <span className="font-semibold">{totalReserved}</span> reserved
                        </span>
                      )}
                    </div>
                  )}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                  />
                </div>
              </button>

              {/* Expanded pool breakdown */}
              {isOpen && (
                <div className="bg-muted/10 px-4 pb-4 pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-3">
                    {product.category} · {product.businessChannel}
                  </p>

                  {product.pools.length === 0 ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      No pool data yet — run the seed script to populate initial stock.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {product.pools.map((pool: any) => (
                        <div
                          key={pool.poolId}
                          className="bg-background border rounded-md p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">{pool.poolLabel}</span>
                            {stockBadge(pool.quantityAvailable, pool.quantityReserved)}
                          </div>

                          <div className="flex gap-4 text-sm">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Available</p>
                              <p className="font-bold text-base leading-tight">{pool.quantityAvailable}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Reserved</p>
                              <p className="font-medium text-base leading-tight text-amber-700">{pool.quantityReserved}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fulfilled</p>
                              <p className="font-medium text-base leading-tight text-green-700">{pool.quantityFulfilled ?? 0}</p>
                            </div>
                          </div>

                          <div className="flex gap-1.5 pt-1 border-t">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs flex-1"
                              onClick={e => openEdit(e, product, pool.poolId)}
                            >
                              <Edit2 className="h-3 w-3 mr-1" />Set
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs flex-1"
                              onClick={e => openAdjust(e, product, pool.poolId)}
                            >
                              <TrendingUp className="h-3 w-3 mr-1" />Adj
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Set stock dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Set Stock Level</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">{selectedProduct?.productName}</p>
              <p className="text-xs text-muted-foreground">
                Pool: {selectedPoolRow?.poolLabel} · Current: {selectedPoolRow?.quantityAvailable ?? 0}
              </p>
            </div>
            <div>
              <Label>New available quantity</Label>
              <Input
                type="number"
                min="0"
                value={editQty}
                onChange={e => setEditQty(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={submitSet} disabled={upsert.isPending}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Adjust stock dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Adjust Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">{selectedProduct?.productName}</p>
              <p className="text-xs text-muted-foreground">
                Pool: {selectedPoolRow?.poolLabel} · Current: {selectedPoolRow?.quantityAvailable ?? 0}
              </p>
            </div>
            <div>
              <Label>Delta (+ to add, − to remove)</Label>
              <Input
                type="number"
                value={adjustDelta}
                onChange={e => setAdjustDelta(e.target.value)}
                className="mt-1"
              />
              {adjustDelta !== "0" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Result: {Math.max(0, (selectedPoolRow?.quantityAvailable ?? 0) + Number(adjustDelta))}
                </p>
              )}
            </div>
            <div>
              <Label>Reason *</Label>
              <Input
                placeholder="e.g. stock count correction"
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setAdjustDialogOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={submitAdjust}
                disabled={adjust.isPending || !adjustReason.trim()}
              >
                Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movement log dialog */}
      <Dialog open={movementsOpen} onOpenChange={setMovementsOpen}>
        <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Movement Log (last 50)</DialogTitle>
          </DialogHeader>
          <div className="divide-y">
            {(movements ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No movements yet</p>
            )}
            {(movements ?? []).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between py-2 text-xs">
                <div className="min-w-0 mr-3">
                  <span className="font-medium">{m.productName}</span>
                  <span className="text-muted-foreground mx-1.5">·</span>
                  <span className="text-muted-foreground">{m.poolName}</span>
                  <span className="text-muted-foreground mx-1.5">·</span>
                  <span>{reasonLabel(m.reason)}</span>
                  {m.referenceId && (
                    <span className="text-muted-foreground"> #{m.referenceId}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={cn("font-bold", m.quantityDelta >= 0 ? "text-green-700" : "text-red-700")}>
                    {m.quantityDelta >= 0 ? "+" : ""}{m.quantityDelta}
                  </span>
                  <span className="text-muted-foreground/60">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
