import { useListProducts, useUpdateProduct } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/priority-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo, useEffect } from "react";
import { Package, Search, Pencil, Check, X } from "lucide-react";
import { useChannel } from "@/lib/channel-context";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";

export default function ProductsPage() {
  const [search, setSearch]       = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [costInput, setCostInput] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");

  const { channel } = useChannel();
  const { lang } = useLang();
  const { data: products, isLoading, refetch } = useListProducts({ search: search || undefined } as any);

  useEffect(() => { setBrandFilter("all"); }, [channel]);

  const channelProducts = useMemo(() => {
    const list = (products ?? []) as any[];
    if (channel === "all") return list;
    if (channel === "cosmetics") return list.filter((p: any) => p.businessChannel === "cosmetics");
    return list.filter((p: any) => p.businessChannel !== "cosmetics");
  }, [products, channel]);

  const brandOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of channelProducts) {
      if ((p as any).brand) seen.add((p as any).brand);
    }
    return Array.from(seen).sort();
  }, [channelProducts]);

  const displayProducts = useMemo(() => {
    if (brandFilter === "all") return channelProducts;
    return channelProducts.filter((p: any) => p.brand === brandFilter);
  }, [channelProducts, brandFilter]);
  const { user } = useAuth();
  const { toast } = useToast();

  // owner_admin and general_manager may edit cost price
  // channel_manager and sales may see cost price (read-only)
  // driver sees nothing
  const canEditCost = user?.role === "owner_admin" || user?.role === "general_manager";
  const canSeeCost = canEditCost || user?.role === "channel_manager" || user?.role === "sales" || user?.role === "accounting";

  const updateProduct = useUpdateProduct({
    mutation: {
      onSuccess: () => {
        setEditingId(null);
        refetch();
        toast({ title: t("costPriceUpdated", lang) });
      },
      onError: () => toast({ title: t("failedToUpdateCostPrice", lang), variant: "destructive" }),
    },
  });

  function startEdit(p: any) {
    setEditingId(p.id);
    setCostInput(p.costPrice != null ? String(p.costPrice) : "");
  }

  function cancelEdit() {
    setEditingId(null);
    setCostInput("");
  }

  function saveCost(productId: number) {
    const trimmed = costInput.trim();
    const value = trimmed === "" ? null : parseFloat(trimmed);
    if (trimmed !== "" && (isNaN(value!) || value! < 0)) {
      toast({ title: t("enterValidCostPrice", lang), variant: "destructive" });
      return;
    }
    updateProduct.mutate({ id: productId, data: { costPrice: value } });
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("products", lang)}</h1>
          <p className="text-muted-foreground text-sm">{displayProducts.length} {t("itemsInCatalog", lang)}</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchProducts", lang)}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {brandOptions.length > 0 && (
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder={t("allBrands", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allBrands", lang)}</SelectItem>
              {brandOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading && (
          <div className="col-span-3 text-center py-8 text-muted-foreground text-sm">{t("loading", lang)}</div>
        )}

        {!isLoading && displayProducts.map((p: any) => {
          const isEditing = editingId === p.id;
          return (
            <Card key={p.id} className="p-4 flex gap-4">
              {/* Product icon */}
              <div className="h-14 w-14 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                <Package className="h-7 w-7 text-amber-600" />
              </div>

              {/* Product info */}
              <div className="flex-1 min-w-0">
                {/* Name + status + optional edit button */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold leading-tight">{p.productName}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <StatusBadge status={p.stockStatus} />
                    {canEditCost && !isEditing && (
                      <button
                        onClick={() => startEdit(p)}
                        title="Edit cost price"
                        className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{p.sku}</p>
                <p className="text-xs text-muted-foreground capitalize mt-0.5">
                  {p.category?.replace(/_/g, " ")} · {p.businessChannel}
                  {p.brand && <span> · {p.brand}</span>}
                </p>

                {/* Price row */}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-bold text-primary">{formatCurrency(p.unitPrice)}</span>

                  {/* Cost price — non-editing display */}
                  {!isEditing && canSeeCost && (
                    p.costPrice != null
                      ? <span className="text-xs text-muted-foreground">{t("costLabel", lang)} {formatCurrency(p.costPrice)}</span>
                      : canEditCost
                        ? <span className="text-xs text-muted-foreground italic">{t("costNotSet", lang)}</span>
                        : null
                  )}
                </div>

                {/* Inline cost price editor (admin / GM only) */}
                {isEditing && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground shrink-0">{t("costLabel", lang)}</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={costInput}
                      onChange={e => setCostInput(e.target.value)}
                      className="h-7 text-xs w-28 px-2"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === "Enter") saveCost(p.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-7 w-7 p-0 bg-green-600 hover:bg-green-700 text-white"
                      disabled={updateProduct.isPending}
                      onClick={() => saveCost(p.id)}
                      title="Save"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground"
                      onClick={cancelEdit}
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        {!isLoading && displayProducts.length === 0 && (
          <div className="col-span-3 text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>{t("noProducts", lang)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
