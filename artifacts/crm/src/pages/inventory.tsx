import { useState, useMemo } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
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
import { Package, History, Search, ChevronDown, Edit2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateInventoryStatus, invStatusBadgeClass, movementReasonLabel, poolDisplayLabel } from "@/lib/inventoryStatus";
import { useChannel } from "@/lib/channel-context";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { CreateProductDialog } from "@/components/create-product-dialog";

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

export default function InventoryPage() {
  const qc = useQueryClient();
  const [search, setSearch]           = useState("");
  const [expandedId, setExpandedId]   = useState<number | null>(null);
  const [stockDialogOpen, setStockDialogOpen]   = useState(false);
  const [stockDialogMode, setStockDialogMode]   = useState<"set" | "delta">("set");
  const [movementsOpen, setMovementsOpen]       = useState(false);
  const [selectedProduct, setSelectedProduct]   = useState<any>(null);
  const [selectedPoolId, setSelectedPoolId]     = useState<string>("");
  const [editQty, setEditQty]         = useState("0");
  const [adjustDelta, setAdjustDelta] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");

  const { user } = useAuth();
  const { channel } = useChannel();
  const { lang } = useLang();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const canCreate = user?.role === "owner_admin" || user?.role === "general_manager";
  const { data: pools } = useQuery<any[]>({
    queryKey: ["/api/inventory/pools"],
    queryFn: () => fetch("/api/inventory/pools", { credentials: "include" }).then(r => r.json()),
  });
  const { data: stock, isLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory/stock"],
    queryFn: () => fetch("/api/inventory/stock", { credentials: "include" }).then(r => r.json()),
  });
  const { data: movements } = useQuery<any[]>({
    queryKey: ["/api/inventory/movements", { limit: 50 }],
    queryFn: () => fetch("/api/inventory/movements?limit=50", { credentials: "include" }).then(r => r.json()),
  });

  const upsert = useMutation({
    mutationFn: (vars: { data: any }) =>
      fetch("/api/inventory/stock", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars.data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inventory/stock"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/movements"] });
      toast({ title: t("stockUpdated", lang) });
      setStockDialogOpen(false);
    },
    onError: (e: any) =>
      toast({ title: t("failedToUpdateStock", lang), description: e?.message, variant: "destructive" }),
  });

  const adjust = useMutation({
    mutationFn: (vars: { data: any }) =>
      fetch("/api/inventory/adjust", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars.data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inventory/stock"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/movements"] });
      toast({ title: t("stockAdjusted", lang) });
      setStockDialogOpen(false);
      setAdjustDelta("0");
      setAdjustReason("");
    },
    onError: (e: any) =>
      toast({ title: t("failedToAdjustStock", lang), description: e?.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    let list = (stock ?? []) as any[];
    if (channel === "cosmetics") list = list.filter(p => p.businessChannel === "cosmetics");
    else if (channel === "coffee") list = list.filter(p => p.businessChannel !== "cosmetics");
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.productName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    return list;
  }, [stock, channel, search]);

  function toggleExpand(productId: number) {
    setExpandedId(prev => (prev === productId ? null : productId));
  }

  function openStockDialog(e: React.MouseEvent, product: any, poolId: number) {
    e.stopPropagation();
    const poolRow = product.pools.find((p: any) => p.poolId === poolId);
    setSelectedProduct(product);
    setSelectedPoolId(String(poolId));
    setEditQty(String(poolRow?.quantityAvailable ?? 0));
    setAdjustDelta("0");
    setAdjustReason("");
    setStockDialogMode("set");
    setStockDialogOpen(true);
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
      toast({ title: t("reasonRequired", lang), variant: "destructive" });
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
          <h1 className="text-2xl font-bold">{t("inventory", lang)}</h1>
          <p className="text-muted-foreground text-sm">
            {t("inventorySubtitle", lang)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />{t("newProduct", lang)}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setMovementsOpen(true)}>
            <History className="h-4 w-4 mr-1.5" />{t("movementLog", lang)}
          </Button>
        </div>
      </div>

      {/* Pool legend */}
      {(pools ?? []).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(pools ?? []).map((pool: any) => (
            <span key={pool.id} className="inline-flex items-center gap-1.5 text-xs bg-muted/40 border rounded px-2.5 py-1 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary/50 shrink-0" />
              <span className="font-medium">{poolDisplayLabel(pool.name, lang)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("searchInventoryPlaceholder", lang)}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading / empty */}
      {isLoading && (
        <p className="text-center py-8 text-muted-foreground text-sm">{t("loading", lang)}</p>
      )}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p>{t("noProducts", lang)}</p>
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
                        <span className="font-semibold text-foreground">{totalAvailable}</span> {t("available", lang).toLowerCase()}
                      </span>
                      {totalReserved > 0 && (
                        <span className="text-amber-700">
                          <span className="font-semibold">{totalReserved}</span> {t("reserved", lang).toLowerCase()}
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
                      {t("noPoolDataYet", lang)}
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
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("available", lang)}</p>
                              <p className="font-bold text-base leading-tight">{pool.quantityAvailable}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("reserved", lang)}</p>
                              <p className="font-medium text-base leading-tight text-amber-700">{pool.quantityReserved}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("fulfilled", lang)}</p>
                              <p className="font-medium text-base leading-tight text-green-700">{pool.quantityFulfilled ?? 0}</p>
                            </div>
                          </div>

                          <div className="flex pt-1 border-t">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs w-full"
                              onClick={e => openStockDialog(e, product, pool.poolId)}
                            >
                              <Edit2 className="h-3 w-3 mr-1" />{t("updateStock", lang)}
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

      {/* Unified stock update dialog */}
      <Dialog open={stockDialogOpen} onOpenChange={v => { setStockDialogOpen(v); if (!v) { setAdjustDelta("0"); setAdjustReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("updateStock", lang)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">{selectedProduct?.productName}</p>
              <p className="text-xs text-muted-foreground">
                {t("pool", lang)}: {selectedPoolRow?.poolLabel} · {t("currentQtyLabel", lang)} {selectedPoolRow?.quantityAvailable ?? 0}
              </p>
            </div>

            {/* Mode selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStockDialogMode("set")}
                className={cn(
                  "px-3 py-2 text-xs font-medium rounded-md border transition-colors text-left",
                  stockDialogMode === "set"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted/50"
                )}
              >
                {t("setExactMode", lang)}
              </button>
              <button
                type="button"
                onClick={() => setStockDialogMode("delta")}
                className={cn(
                  "px-3 py-2 text-xs font-medium rounded-md border transition-colors text-left",
                  stockDialogMode === "delta"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted/50"
                )}
              >
                {t("deltaMode", lang)}
              </button>
            </div>

            <p className="text-xs text-muted-foreground">{t("stockUpdateHelper", lang)}</p>

            {stockDialogMode === "set" ? (
              <div>
                <Label>{t("newAvailableQty", lang)}</Label>
                <Input
                  type="number"
                  min="0"
                  value={editQty}
                  onChange={e => setEditQty(e.target.value)}
                  className="mt-1"
                  autoFocus
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>{t("deltaLabel", lang)}</Label>
                  <Input
                    type="number"
                    value={adjustDelta}
                    onChange={e => setAdjustDelta(e.target.value)}
                    className="mt-1"
                    autoFocus
                  />
                  {adjustDelta !== "0" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("resultLabel", lang)}: {Math.max(0, (selectedPoolRow?.quantityAvailable ?? 0) + Number(adjustDelta))}
                    </p>
                  )}
                </div>
                <div>
                  <Label>{t("reason", lang)} *</Label>
                  <Input
                    placeholder={t("reason", lang)}
                    value={adjustReason}
                    onChange={e => setAdjustReason(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setStockDialogOpen(false)}>{t("cancel", lang)}</Button>
              <Button
                size="sm"
                onClick={stockDialogMode === "set" ? submitSet : submitAdjust}
                disabled={upsert.isPending || adjust.isPending || (stockDialogMode === "delta" && !adjustReason.trim())}
              >
                {t("save", lang)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movement log dialog */}
      <Dialog open={movementsOpen} onOpenChange={setMovementsOpen}>
        <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("movementLog", lang)} ({t("last50Label", lang)})</DialogTitle>
          </DialogHeader>
          <div className="divide-y">
            {(movements ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">{t("noMovementsYet", lang)}</p>
            )}
            {(movements ?? []).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between py-2 text-xs">
                <div className="min-w-0 mr-3">
                  <span className="font-medium">{m.productName}</span>
                  <span className="text-muted-foreground mx-1.5">·</span>
                  <span className="text-muted-foreground">{m.poolName}</span>
                  <span className="text-muted-foreground mx-1.5">·</span>
                  <span>{movementReasonLabel(m.reason, lang)}</span>
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

      <CreateProductDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["/api/inventory/stock"] });
          qc.invalidateQueries({ queryKey: ["/api/inventory/movements"] });
        }}
        defaultChannel={channel !== "all" ? channel : undefined}
      />
    </div>
  );
}
