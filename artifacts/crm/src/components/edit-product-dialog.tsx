import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useUpdateProduct, useGetFxRates } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";
import { SUPPORTED_CURRENCIES, convertToTRY } from "@/lib/fx";
import { formatCurrencyWithCode } from "@/lib/utils";

interface Props {
  product: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditProductDialog({ product, open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const { lang } = useLang();
  const { toast } = useToast();

  const canEditCost = user?.role === "owner_admin" || user?.role === "general_manager";

  const [productName, setProductName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [businessChannel, setBusinessChannel] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [stockStatus, setStockStatus] = useState<"in_stock" | "low_stock" | "out_of_stock">("in_stock");
  const [brand, setBrand] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [unitPriceCurrency, setUnitPriceCurrency] = useState("TRY");
  const [costPriceCurrency, setCostPriceCurrency] = useState("TRY");
  const [active, setActive] = useState(true);

  const { data: fxRates } = useGetFxRates();

  useEffect(() => {
    if (product) {
      setProductName(product.productName ?? "");
      setSku(product.sku ?? "");
      setCategory(product.category ?? "");
      setBusinessChannel(product.businessChannel ?? "");
      setUnitPrice(product.unitPrice != null ? String(product.unitPrice) : "");
      setStockStatus(product.stockStatus ?? "in_stock");
      setBrand(product.brand ?? "");
      setCostPrice(product.costPrice != null ? String(product.costPrice) : "");
      setUnitPriceCurrency(product.unitPriceCurrency ?? "TRY");
      setCostPriceCurrency(product.costPriceCurrency ?? "TRY");
      setActive(product.active ?? true);
    }
  }, [product]);

  const updateMutation = useUpdateProduct({
    mutation: {
      onSuccess: () => {
        toast({ title: t("productUpdated", lang) });
        onOpenChange(false);
        onSaved();
      },
      onError: () => {
        toast({ title: t("failedToUpdateProduct", lang), variant: "destructive" });
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;

    const uPrice = parseFloat(unitPrice);
    if (!productName.trim() || !sku.trim() || !category.trim() || !businessChannel || isNaN(uPrice) || uPrice < 0) {
      toast({
        title: lang === "tr" ? "Lütfen tüm zorunlu alanları doldurun" : "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const data: Record<string, unknown> = {
      productName: productName.trim(),
      sku: sku.trim(),
      category: category.trim(),
      businessChannel,
      unitPrice: uPrice,
      stockStatus,
      brand: brand.trim() || null,
      unitPriceCurrency,
      costPriceCurrency,
    };

    if (canEditCost) {
      data.costPrice = costPrice.trim() !== "" ? parseFloat(costPrice) : null;
      data.active = active;
    }

    updateMutation.mutate({ id: product.id, data: data as any });
  }

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editProduct", lang)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-name">{t("productNameLabel", lang)} *</Label>
              <Input
                id="ep-name"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-sku">{t("skuLabel", lang)} *</Label>
              <Input
                id="ep-sku"
                value={sku}
                onChange={e => setSku(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-cat">{t("categoryLabel", lang)} *</Label>
              <Input
                id="ep-cat"
                value={category}
                onChange={e => setCategory(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("channel", lang)} *</Label>
              <Select value={businessChannel} onValueChange={setBusinessChannel}>
                <SelectTrigger><SelectValue placeholder={t("selectChannel", lang)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="coffee">{t("coffee", lang)}</SelectItem>
                  <SelectItem value="cosmetics">{t("cosmetics", lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-price">{t("unitPrice", lang)} *</Label>
              <div className="flex gap-1.5">
                <Input
                  id="ep-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPrice}
                  onChange={e => setUnitPrice(e.target.value)}
                  required
                  className="flex-1"
                />
                <Select value={unitPriceCurrency} onValueChange={setUnitPriceCurrency}>
                  <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {unitPriceCurrency !== "TRY" && unitPrice && !isNaN(parseFloat(unitPrice)) && (() => {
                const approx = convertToTRY(parseFloat(unitPrice), unitPriceCurrency, fxRates);
                return approx != null ? (
                  <p className="text-[11px] text-muted-foreground">{t("fxApproxTRY", lang)} {formatCurrencyWithCode(approx, "TRY")}</p>
                ) : null;
              })()}
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

          <div className="space-y-1.5">
            <Label htmlFor="ep-brand">{t("brandOptional", lang)}</Label>
            <Input
              id="ep-brand"
              value={brand}
              onChange={e => setBrand(e.target.value)}
            />
          </div>

          {canEditCost && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ep-cost">{t("costPriceOptional", lang)}</Label>
                <div className="flex gap-1.5">
                  <Input
                    id="ep-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={costPrice}
                    onChange={e => setCostPrice(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={costPriceCurrency} onValueChange={setCostPriceCurrency}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {costPriceCurrency !== "TRY" && costPrice && !isNaN(parseFloat(costPrice)) && (() => {
                  const approx = convertToTRY(parseFloat(costPrice), costPriceCurrency, fxRates);
                  return approx != null ? (
                    <p className="text-[11px] text-muted-foreground">{t("fxApproxTRY", lang)} {formatCurrencyWithCode(approx, "TRY")}</p>
                  ) : null;
                })()}
              </div>
              <div className="space-y-1.5">
                <Label>{t("activeStatus", lang)}</Label>
                <Select value={active ? "true" : "false"} onValueChange={v => setActive(v === "true")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">{t("activeStatus", lang)}</SelectItem>
                    <SelectItem value="false">{t("inactiveStatus", lang)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              {t("cancel", lang)}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "..." : t("saveChanges", lang)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
