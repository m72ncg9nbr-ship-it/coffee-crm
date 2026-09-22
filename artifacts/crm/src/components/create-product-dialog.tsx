import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCreateProduct, useUpdateProduct } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";
import { poolDisplayLabel } from "@/lib/inventoryStatus";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  defaultChannel?: string;
}

export function CreateProductDialog({ open, onOpenChange, onCreated, defaultChannel }: Props) {
  const { user } = useAuth();
  const { lang } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();

  const canCreate = user?.role === "owner_admin" || user?.role === "general_manager";
  const canEditCost = canCreate;

  const [productName, setProductName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [businessChannel, setBusinessChannel] = useState(defaultChannel ?? "");
  const [unitPrice, setUnitPrice] = useState("");
  const [stockStatus, setStockStatus] = useState<"in_stock" | "low_stock" | "out_of_stock">("in_stock");
  const [costPrice, setCostPrice] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [selectedPoolId, setSelectedPoolId] = useState("");

  const { data: pools } = useQuery<any[]>({
    queryKey: ["/api/inventory/pools"],
    queryFn: () => fetch("/api/inventory/pools", { credentials: "include" }).then(r => r.json()),
    enabled: open,
  });

  const createMutation = useCreateProduct({
    mutation: {
      onError: (err: any) => {
        const msg = (err?.message ?? "").toLowerCase();
        if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("sku")) {
          toast({ title: t("skuAlreadyExists", lang), variant: "destructive" });
        } else {
          toast({ title: t("failedToCreateProduct", lang), description: err?.message, variant: "destructive" });
        }
      },
    },
  });

  const updateMutation = useUpdateProduct();

  function reset() {
    setProductName("");
    setSku("");
    setCategory("");
    setBusinessChannel(defaultChannel ?? "");
    setUnitPrice("");
    setStockStatus("in_stock");
    setCostPrice("");
    setInitialStock("");
    setSelectedPoolId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const uPrice = parseFloat(unitPrice);
    if (!productName.trim() || !sku.trim() || !category.trim() || !businessChannel || isNaN(uPrice) || uPrice < 0) {
      toast({
        title: lang === "tr" ? "Lütfen tüm zorunlu alanları doldurun" : "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    let createdProduct: any;
    try {
      createdProduct = await createMutation.mutateAsync({
        data: {
          productName: productName.trim(),
          sku: sku.trim(),
          category: category.trim(),
          businessChannel,
          unitPrice: uPrice,
          stockStatus,
          active: true,
        },
      });
    } catch {
      return;
    }

    const productId: number = createdProduct.id;

    const cPrice = costPrice.trim() !== "" ? parseFloat(costPrice) : null;
    if (cPrice != null && !isNaN(cPrice) && cPrice >= 0 && canEditCost) {
      try {
        await updateMutation.mutateAsync({ id: productId, data: { costPrice: cPrice } });
      } catch {
        // non-critical
      }
    }

    const iStock = initialStock.trim() !== "" ? parseInt(initialStock, 10) : null;
    if (iStock != null && !isNaN(iStock) && iStock > 0 && selectedPoolId) {
      try {
        await fetch("/api/inventory/stock", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            poolId: Number(selectedPoolId),
            quantityAvailable: iStock,
          }),
        });
        qc.invalidateQueries({ queryKey: ["/api/inventory/stock"] });
        qc.invalidateQueries({ queryKey: ["/api/inventory/movements"] });
      } catch {
        // non-critical
      }
    }

    toast({ title: t("productCreated", lang) });
    reset();
    onOpenChange(false);
    onCreated();
  }

  if (!canCreate) return null;

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const showStockPool = (parseInt(initialStock, 10) || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newProduct", lang)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-name">{t("productNameLabel", lang)} *</Label>
              <Input
                id="cp-name"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-sku">{t("skuLabel", lang)} *</Label>
              <Input
                id="cp-sku"
                value={sku}
                onChange={e => setSku(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-cat">{t("categoryLabel", lang)} *</Label>
              <Input
                id="cp-cat"
                value={category}
                onChange={e => setCategory(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("channel", lang)} *</Label>
              <Select value={businessChannel} onValueChange={setBusinessChannel}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectChannel", lang)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coffee">{t("coffee", lang)}</SelectItem>
                  <SelectItem value="cosmetics">{t("cosmetics", lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-price">{t("unitPrice", lang)} *</Label>
              <Input
                id="cp-price"
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={e => setUnitPrice(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("stockStatusLabel", lang)}</Label>
              <Select value={stockStatus} onValueChange={v => setStockStatus(v as typeof stockStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">{t("statusInStock", lang)}</SelectItem>
                  <SelectItem value="low_stock">{t("statusLowStock", lang)}</SelectItem>
                  <SelectItem value="out_of_stock">{t("statusOutOfStock", lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {canEditCost && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-cost">{t("costPriceOptional", lang)}</Label>
              <Input
                id="cp-cost"
                type="number"
                min="0"
                step="0.01"
                value={costPrice}
                onChange={e => setCostPrice(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-stock">{t("initialStockOptional", lang)}</Label>
              <Input
                id="cp-stock"
                type="number"
                min="0"
                step="1"
                value={initialStock}
                onChange={e => setInitialStock(e.target.value)}
              />
            </div>
            {showStockPool && (
              <div className="space-y-1.5">
                <Label>{t("stockPoolLabel", lang)}</Label>
                <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectPool", lang)} />
                  </SelectTrigger>
                  <SelectContent>
                    {(pools ?? []).map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {poolDisplayLabel(p.name, lang)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { reset(); onOpenChange(false); }}
              disabled={isSubmitting}
            >
              {t("cancel", lang)}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "..." : t("createProduct", lang)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
