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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Package, TrendingUp, TrendingDown, Search, Edit2, History } from "lucide-react";

function stockBadge(available: number) {
  if (available === 0) return <Badge variant="destructive" className="text-xs">Out</Badge>;
  if (available <= 10) return <Badge className="bg-amber-100 text-amber-800 text-xs">Low</Badge>;
  return <Badge className="bg-green-100 text-green-800 text-xs">OK</Badge>;
}

function reasonLabel(reason: string) {
  switch (reason) {
    case "order_reserved": return "Reserved for order";
    case "order_cancelled_released": return "Released (order cancelled)";
    case "manual_set": return "Manual set";
    case "manual_adjustment": return "Manual adjustment";
    default: return reason.replace(/_/g, " ");
  }
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string>("");
  const [editQty, setEditQty] = useState("0");
  const [adjustDelta, setAdjustDelta] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");

  const { data: pools } = useListInventoryPools();
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
      onError: (e: any) => toast({ title: "Failed to update stock", description: e?.message, variant: "destructive" }),
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
      onError: (e: any) => toast({ title: "Failed to adjust stock", description: e?.message, variant: "destructive" }),
    },
  });

  const filtered = (stock ?? []).filter((p: any) =>
    !search ||
    p.productName.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  function openEdit(product: any, poolId: number) {
    const poolRow = product.pools.find((p: any) => p.poolId === poolId);
    setSelectedProduct(product);
    setSelectedPoolId(String(poolId));
    setEditQty(String(poolRow?.quantityAvailable ?? 0));
    setEditDialogOpen(true);
  }

  function openAdjust(product: any, poolId: number) {
    setSelectedProduct(product);
    setSelectedPoolId(String(poolId));
    setAdjustDelta("0");
    setAdjustReason("");
    setAdjustDialogOpen(true);
  }

  function submitSet() {
    if (!selectedProduct || !selectedPoolId) return;
    upsert.mutate({ data: { productId: selectedProduct.productId, poolId: Number(selectedPoolId), quantityAvailable: Number(editQty) } });
  }

  function submitAdjust() {
    if (!selectedProduct || !selectedPoolId || !adjustReason.trim()) {
      toast({ title: "Reason is required", variant: "destructive" });
      return;
    }
    adjust.mutate({ data: { productId: selectedProduct.productId, poolId: Number(selectedPoolId), delta: Number(adjustDelta), reason: adjustReason.trim() } });
  }

  const selectedPoolRow = selectedProduct?.pools?.find((p: any) => p.poolId === Number(selectedPoolId));
  const poolList = pools ?? [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground text-sm">Stock levels across all allocation pools</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMovementsOpen(true)}>
          <History className="h-4 w-4 mr-1.5" />Movement Log
        </Button>
      </div>

      {/* Pool legend */}
      {poolList.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {poolList.map((pool: any) => (
            <div key={pool.id} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 border rounded px-2.5 py-1.5">
              <span className="h-2 w-2 rounded-full bg-primary/60" />
              <span className="font-medium">{pool.label}</span>
              <span className="text-muted-foreground/60">({pool.name})</span>
            </div>
          ))}
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p>No products found</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((product: any) => (
          <Card key={product.productId} className="overflow-hidden">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold">{product.productName}</CardTitle>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{product.sku} · {product.category} · {product.businessChannel}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {product.pools.map((pool: any) => (
                  <div key={pool.poolId} className="bg-muted/30 border rounded-md p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">{pool.poolLabel}</span>
                      {stockBadge(pool.quantityAvailable)}
                    </div>
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">Available </span>
                        <span className="font-bold">{pool.quantityAvailable}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Reserved </span>
                        <span className="font-medium text-amber-700">{pool.quantityReserved}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 flex-1" onClick={() => openEdit(product, pool.poolId)}>
                        <Edit2 className="h-3 w-3 mr-1" />Set
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 flex-1" onClick={() => openAdjust(product, pool.poolId)}>
                        <TrendingUp className="h-3 w-3 mr-1" />Adj
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
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
                Pool: {selectedPoolRow?.poolLabel} · Current available: {selectedPoolRow?.quantityAvailable ?? 0}
              </p>
            </div>
            <div>
              <Label>New available quantity</Label>
              <Input type="number" min="0" value={editQty} onChange={e => setEditQty(e.target.value)} className="mt-1" />
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
                Pool: {selectedPoolRow?.poolLabel} · Current available: {selectedPoolRow?.quantityAvailable ?? 0}
              </p>
            </div>
            <div>
              <Label>Delta (positive = add, negative = remove)</Label>
              <Input type="number" value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)} className="mt-1" />
              {adjustDelta !== "0" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Result: {Math.max(0, (selectedPoolRow?.quantityAvailable ?? 0) + Number(adjustDelta))}
                </p>
              )}
            </div>
            <div>
              <Label>Reason *</Label>
              <Input
                placeholder="e.g. physical count correction"
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setAdjustDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={submitAdjust} disabled={adjust.isPending || !adjustReason.trim()}>Apply</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movement log dialog */}
      <Dialog open={movementsOpen} onOpenChange={setMovementsOpen}>
        <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Recent Movements (last 50)</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {(movements ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No movements yet</p>
            )}
            {(movements ?? []).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-b-0">
                <div>
                  <span className="font-medium">{m.productName}</span>
                  <span className="text-muted-foreground mx-1.5">·</span>
                  <span className="text-muted-foreground">{m.poolName}</span>
                  <span className="text-muted-foreground mx-1.5">·</span>
                  <span>{reasonLabel(m.reason)}</span>
                  {m.referenceId && <span className="text-muted-foreground"> (#{m.referenceId})</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className={`font-bold ${m.quantityDelta >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {m.quantityDelta >= 0 ? "+" : ""}{m.quantityDelta}
                  </span>
                  <span className="text-muted-foreground/60">{new Date(m.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
