import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useListCustomers,
  useGetCustomer,
  useListCustomerAddresses,
  useListProducts,
  useCreateOrder,
} from "@workspace/api-client-react";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";
import { channelDisplayLabel } from "@/lib/customer-options";
import { useChannel } from "@/lib/channel-context";
import {
  calculateInventoryStatus,
  getPoolNameForSource,
  invStatusTextClass,
  invStatusBadgeClass,
  POOL_LABELS,
} from "@/lib/inventoryStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { PriorityBadge } from "@/components/priority-badge";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

interface Item {
  productId: number;
  productName: string;
  quantity: number;
  unitPriceSnapshot: number;
}

export default function OrderNewPage() {
  const [, navigate] = useLocation();
  const { lang } = useLang();
  const { channel: globalChannel } = useChannel();
  const { data: customers } = useListCustomers();
  const { data: products } = useListProducts();
  const { data: stockData } = useQuery<any[]>({
    queryKey: ["/api/inventory/stock"],
    queryFn: () => fetch("/api/inventory/stock", { credentials: "include" }).then(r => r.json()),
  });

  const filteredCustomers = useMemo(() => {
    const list = (customers ?? []) as any[];
    if (globalChannel === "all") return list;
    if (globalChannel === "cosmetics") return list.filter((c: any) => c.businessChannel === "cosmetics");
    return list.filter((c: any) => c.businessChannel !== "cosmetics");
  }, [customers, globalChannel]);

  const filteredProducts = useMemo(() => {
    const list = (products ?? []) as any[];
    if (globalChannel === "all") return list;
    if (globalChannel === "cosmetics") return list.filter((p: any) => p.businessChannel === "cosmetics");
    return list.filter((p: any) => p.businessChannel !== "cosmetics");
  }, [products, globalChannel]);

  const [customerId, setCustomerId] = useState<string>("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [urgency, setUrgency] = useState<string>("normal");
  const [orderSource, setOrderSource] = useState("phone");
  const [businessChannel, setBusinessChannel] = useState("horeca");
  const [notes, setNotes] = useState("");
  const [sampleReason, setSampleReason] = useState("");
  const [sampleEventName, setSampleEventName] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const isSampleOrder = orderSource === "sample" || orderSource === "free_issue";
  const [items, setItems] = useState<Item[]>([]);
  const [productPick, setProductPick] = useState("");
  const [qty, setQty] = useState("1");

  const cid = customerId ? Number(customerId) : 0;
  const { data: customer } = useGetCustomer(cid, { query: { enabled: !!cid } as any });
  const { data: addresses } = useListCustomerAddresses(cid, { query: { enabled: !!cid } as any });
  const { data: orderPolicy } = useQuery({
    queryKey: ["customer-order-policy", cid],
    queryFn: () => fetch(`/api/customers/${cid}/order-policy`, { credentials: "include" }).then(r => r.json()),
    enabled: !!cid,
  });
  const policy = orderPolicy as { status: string; reasonCode: string; overdueAmount: number; overdueThreshold: number | null; canOverride: boolean; messageEn: string; messageTr: string } | undefined;
  const c = customer as any;
  const deliveryAddresses = (addresses ?? []).filter((a: any) => a.isDeliveryAddress);
  const defaultAddr = deliveryAddresses.find((a: any) => a.isDefault) ?? deliveryAddresses[0];
  const hasDeliveryAddress = deliveryAddresses.length > 0;

  // Auto-fill from customer (6.2)
  useEffect(() => {
    if (c) {
      setBusinessChannel(c.businessChannel ?? "horeca");
      // Map A/B/C → urgency suggestion
      if (c.priorityClass === "A") setUrgency("high");
      else if (c.priorityClass === "B") setUrgency("normal");
      else setUrgency("normal");
    }
  }, [c?.id]);

  // ── Pool-based stock lookup ──────────────────────────────────────────────
  const poolName = getPoolNameForSource(orderSource);
  const poolLabel = POOL_LABELS[poolName] ?? poolName;

  // Map productId → { available, reserved } for the currently selected pool
  const poolStockMap = useMemo(() => {
    const map = new Map<number, { available: number; reserved: number }>();
    for (const item of (stockData ?? []) as any[]) {
      const pool = (item.pools ?? []).find((p: any) => p.poolName === poolName);
      if (pool) {
        map.set(item.productId, {
          available: pool.quantityAvailable,
          reserved: pool.quantityReserved,
        });
      }
    }
    return map;
  }, [stockData, poolName]);

  // Items in the cart that have pool-level stock issues
  const cartPoolWarnings = useMemo(() =>
    items.filter(i => {
      const ps = poolStockMap.get(i.productId);
      if (!ps) return false;
      const { status } = calculateInventoryStatus(ps.available, ps.reserved);
      return status === "out_of_stock" || status === "low_stock";
    }),
  [items, poolStockMap]);

  const [stockWarnings, setStockWarnings] = useState<Array<{ productName: string; requested: number; available: number; poolName: string }>>([]);

  const create = useCreateOrder({
    mutation: {
      onSuccess: (data: any) => {
        const warnings = data.stockWarnings ?? [];
        if (warnings.length > 0) {
          setStockWarnings(warnings);
          toast({
            title: t("orderCreatedWithWarnings", lang),
            description: `${data.orderNumber} — ${warnings.length} ${t("itemsHaveInsufficientStock", lang)}`,
            variant: "destructive",
          });
        } else {
          toast({ title: t("orderCreated", lang), description: `${data.orderNumber}` });
          navigate(`/orders/${data.id}`);
        }
      },
      onError: (e: any) => toast({ title: t("failedToCreateOrder", lang), description: e?.error ?? "", variant: "destructive" }),
    },
  });

  const total = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unitPriceSnapshot, 0), [items]);

  function addItem() {
    const pid = Number(productPick);
    const qn = Number(qty);
    if (!pid || qn <= 0) return;
    const p = filteredProducts.find((x: any) => x.id === pid) as any;
    if (!p) return;
    setItems(prev => {
      const existing = prev.find(i => i.productId === pid);
      if (existing) return prev.map(i => i.productId === pid ? { ...i, quantity: i.quantity + qn } : i);
      return [...prev, { productId: pid, productName: p.productName, quantity: qn, unitPriceSnapshot: parseFloat(p.unitPrice) }];
    });
    setProductPick("");
    setQty("1");
  }

  function removeItem(pid: number) {
    setItems(prev => prev.filter(i => i.productId !== pid));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cid) {
      toast({ title: t("selectCustomerFirst", lang), variant: "destructive" });
      return;
    }
    if (policy?.status === "blocked" && !overrideReason.trim()) {
      toast({ title: t("overrideRequiresReason", lang), variant: "destructive" });
      return;
    }
    create.mutate({
      data: {
        customerId: cid,
        businessChannel,
        orderSource,
        requestedDeliveryDate: requestedDeliveryDate || undefined,
        urgency,
        notes: notes || undefined,
        sampleReason: isSampleOrder && sampleReason ? sampleReason : undefined,
        sampleEventName: isSampleOrder && sampleEventName ? sampleEventName : undefined,
        overrideReason: policy?.status === "blocked" && overrideReason.trim() ? overrideReason.trim() : undefined,
        items: items.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPriceSnapshot: i.unitPriceSnapshot,
        })),
      } as any,
    });
  }

  const hasItems = items.length > 0;
  const hasDate = !!requestedDeliveryDate;
  const hasAddr = hasDeliveryAddress;
  const isComplete = hasItems && hasDate && hasAddr;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/orders">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1.5" />{t("back", lang)}</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t("newOrder", lang)}</h1>
          <p className="text-muted-foreground text-sm">{t("newOrderSubtitle", lang)}</p>
        </div>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">{t("customer", lang)}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>{t("customer", lang)} *</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder={t("selectCustomerPlaceholder", lang)} /></SelectTrigger>
                  <SelectContent>
                    {filteredCustomers.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.companyName} ({c.priorityClass})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {c && (
                <div className="bg-muted/40 rounded-md p-3 text-xs space-y-1.5 border">
                  <div className="flex items-center gap-2 flex-wrap">
                    <PriorityBadge priority={c.priorityClass} />
                    <span className="font-semibold text-sm">{c.companyName}</span>
                    <span className="text-muted-foreground">· {c.contactPerson}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                    <span>{t("phone", lang)}: {c.phone}</span>
                    <span>{t("emailLabel", lang)}: {c.email}</span>
                    <span>{t("payment", lang)}: <span className="capitalize">{c.paymentTerms?.replace(/_/g, " ")}</span></span>
                    {c.discountLevel && <span>{t("discount", lang)}: {c.discountLevel}%</span>}
                    <span>{t("channel", lang)}: <span className="capitalize">{c.businessChannel}</span></span>
                  </div>
                  {defaultAddr ? (
                    <div className="text-muted-foreground">
                      {t("defaultDelivery", lang)}: {defaultAddr.street}, {defaultAddr.postalCode} {defaultAddr.city}
                    </div>
                  ) : (
                    <div className="text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {t("noDefaultAddress", lang)}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment policy warning banner */}
          {cid > 0 && policy?.status === "warning" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 flex gap-3 items-start">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">{t("policyWarning", lang)}</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  {lang === "tr" ? policy.messageTr : policy.messageEn}
                </p>
                {policy.overdueAmount > 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    {t("overdueAmount", lang)}: <span className="font-semibold">{policy.overdueAmount.toFixed(2)}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Payment policy blocked banner + override */}
          {cid > 0 && policy?.status === "blocked" && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 space-y-3">
              <div className="flex gap-3 items-start">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-800">{t("policyBlocked", lang)}</p>
                  <p className="text-sm text-red-700 mt-0.5">
                    {lang === "tr" ? policy.messageTr : policy.messageEn}
                  </p>
                  {policy.overdueAmount > 0 && (
                    <p className="text-xs text-red-600 mt-1">
                      {t("overdueAmount", lang)}: <span className="font-semibold">{policy.overdueAmount.toFixed(2)}</span>
                      {policy.overdueThreshold != null && (
                        <> · {t("thresholdLabel", lang)}: <span className="font-semibold">{policy.overdueThreshold.toFixed(2)}</span></>
                      )}
                    </p>
                  )}
                </div>
              </div>
              {policy.canOverride && (
                <div className="space-y-1.5 border-t border-red-200 pt-3">
                  <Label className="text-red-800 text-xs font-semibold">{t("overrideReason", lang)} *</Label>
                  <Input
                    className="border-red-300 focus:ring-red-400 bg-white"
                    placeholder={t("overrideReasonPlaceholder", lang)}
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">{t("orderItems", lang)}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>{t("product", lang)}</Label>
                  <Select value={productPick} onValueChange={setProductPick}>
                    <SelectTrigger><SelectValue placeholder={t("chooseProduct", lang)} /></SelectTrigger>
                    <SelectContent>
                      {filteredProducts.map((p: any) => {
                        const ps = poolStockMap.get(p.id);
                        const invStatus = ps
                          ? calculateInventoryStatus(ps.available, ps.reserved)
                          : null;
                        const statusText = invStatus
                          ? `${poolLabel}: ${ps!.available} avail · ${invStatus.label}`
                          : "";
                        return (
                          <SelectItem
                            key={p.id}
                            value={String(p.id)}
                            textValue={`${p.productName} — ${formatCurrency(parseFloat(p.unitPrice))}/${p.unit ?? "ea"}`}
                          >
                            <span>
                              {p.productName} — {formatCurrency(parseFloat(p.unitPrice))}/{p.unit ?? "ea"}
                              {invStatus ? (
                                <span className={`ml-2 text-xs ${invStatusTextClass(invStatus.status)}`}>
                                  · {statusText}
                                </span>
                              ) : null}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32">
                  <Label>{t("qty", lang)}</Label>
                  <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className="min-w-0" />
                </div>
                <Button type="button" onClick={addItem} disabled={!productPick}>
                  <Plus className="h-4 w-4 mr-1" />{t("add", lang)}
                </Button>
              </div>

              {items.length > 0 ? (
                <div className="border rounded-md divide-y">
                  {items.map(i => (
                    <div key={i.productId} className="flex items-center justify-between p-2.5 text-sm">
                      <div>
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          {i.productName}
                          {(() => {
                            const ps = poolStockMap.get(i.productId);
                            // Show badge even when no pool data: "Not Allocated" (gray)
                            const { status, label } = ps
                              ? calculateInventoryStatus(ps.available, ps.reserved)
                              : { status: "not_allocated" as const, label: t("notAllocated", lang) };
                            const cls = invStatusBadgeClass(status);
                            return (
                              <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {i.quantity} × {formatCurrency(i.unitPriceSnapshot)} = {formatCurrency(i.quantity * i.unitPriceSnapshot)}
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(i.productId)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ))}
                  <div className="p-2.5 bg-muted/30 text-sm font-semibold flex justify-between">
                    <span>{t("total", lang)}</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">{t("noItemsYet", lang)}</p>
              )}

              {cartPoolWarnings.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{t("stockWarning", lang)} — {poolLabel} pool:</p>
                    {cartPoolWarnings.map((item, idx) => {
                      const ps = poolStockMap.get(item.productId)!;
                      const { label, allocated } = calculateInventoryStatus(ps.available, ps.reserved);
                      return (
                        <p key={idx}>
                          {item.productName}: {ps.available} of {allocated} available ({label})
                        </p>
                      );
                    })}
                    <p className="mt-0.5 opacity-70">{t("orderSavedAnyway", lang)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">{t("deliveryAndNotes", lang)}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("requestedDeliveryDate", lang)}</Label>
                <Input type="date" value={requestedDeliveryDate} onChange={e => setRequestedDeliveryDate(e.target.value)} />
              </div>
              <div>
                <Label>{t("urgency", lang)}</Label>
                <Select value={urgency} onValueChange={setUrgency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("low", lang)}</SelectItem>
                    <SelectItem value="normal">{t("normal", lang)}</SelectItem>
                    <SelectItem value="high">{t("high", lang)}</SelectItem>
                    <SelectItem value="critical">{t("critical", lang)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("orderSourceLabel", lang)}</Label>
                <Select value={orderSource} onValueChange={setOrderSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">{t("phone", lang)}</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="sales_rep">{t("salesRep", lang)}</SelectItem>
                    <SelectItem value="b2b">B2B</SelectItem>
                    <SelectItem value="direct">{t("direct", lang)}</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="sample">{t("sample", lang)}</SelectItem>
                    <SelectItem value="free_issue">{t("freeIssue", lang)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("channel", lang)}</Label>
                <Select value={businessChannel} onValueChange={setBusinessChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horeca">{channelDisplayLabel("horeca", lang)}</SelectItem>
                    <SelectItem value="office">{channelDisplayLabel("office", lang)}</SelectItem>
                    <SelectItem value="retail">{channelDisplayLabel("retail", lang)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>{t("notes", lang)}</Label>
                <textarea
                  className="w-full text-sm border rounded-md p-2 h-20 resize-none bg-background"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={t("specialInstructions", lang)}
                />
              </div>
              {isSampleOrder && (
                <>
                  <div className="col-span-2">
                    <Label>{t("sampleReasonLabel", lang)}</Label>
                    <Input
                      value={sampleReason}
                      onChange={e => setSampleReason(e.target.value)}
                      placeholder={t("sampleReasonPlaceholder", lang)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>{t("sampleEventLabel", lang)} <span className="text-muted-foreground">({t("optional", lang)})</span></Label>
                    <Input
                      value={sampleEventName}
                      onChange={e => setSampleEventName(e.target.value)}
                      placeholder={t("sampleEventPlaceholder", lang)}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-4">
            <CardHeader className="pb-3"><CardTitle className="text-sm">{t("completeness", lang)}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <CheckRow ok={!!cid} label={t("customerSelectedLabel", lang)} />
              <CheckRow ok={hasItems} label={t("atLeastOneItem", lang)} />
              <CheckRow ok={hasDate} label={t("deliveryDateSet", lang)} />
              <CheckRow ok={hasAddr} label={t("deliveryAddressAvailable", lang)} />
              <div className="pt-2 border-t mt-3 text-xs">
                {isComplete ? (
                  <p className="text-green-700">{t("orderWillBePlanned", lang)}</p>
                ) : (
                  <p className="text-amber-700">{t("orderWillBeIncomplete", lang)}</p>
                )}
              </div>
              {stockWarnings.length > 0 && (
                <div className="text-xs bg-red-50 border border-red-200 rounded p-2 mt-2 space-y-1">
                  <p className="font-semibold text-red-800">{t("stockWarningsSaved", lang)}</p>
                  {stockWarnings.map((w, i) => (
                    <p key={i} className="text-red-700">{w.productName}: requested {w.requested}, only {w.available} available in {w.poolName}</p>
                  ))}
                </div>
              )}
              <Button
                type="submit"
                disabled={!cid || create.isPending || (policy?.status === "blocked" && !policy.canOverride) || (policy?.status === "blocked" && policy.canOverride && !overrideReason.trim())}
                className="w-full mt-3"
              >
                {create.isPending ? t("creating", lang) : policy?.status === "blocked" ? t("proceedWithOverride", lang) : t("createOrder", lang)}
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
