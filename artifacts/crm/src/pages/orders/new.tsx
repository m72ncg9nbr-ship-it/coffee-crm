import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  useListCustomers,
  useGetCustomer,
  useListCustomerAddresses,
  useListProducts,
  useCreateOrder,
  useListInventoryStock,
} from "@workspace/api-client-react";
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
  const { channel: globalChannel } = useChannel();
  const { data: customers } = useListCustomers();
  const { data: products } = useListProducts();
  const { data: stockData } = useListInventoryStock();

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

  const isSampleOrder = orderSource === "sample" || orderSource === "free_issue";
  const [items, setItems] = useState<Item[]>([]);
  const [productPick, setProductPick] = useState("");
  const [qty, setQty] = useState("1");

  const cid = customerId ? Number(customerId) : 0;
  const { data: customer } = useGetCustomer(cid, { query: { enabled: !!cid } as any });
  const { data: addresses } = useListCustomerAddresses(cid, { query: { enabled: !!cid } as any });
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
            title: "Order created with stock warnings",
            description: `${data.orderNumber} — ${warnings.length} item(s) have insufficient stock`,
            variant: "destructive",
          });
        } else {
          toast({ title: "Order created", description: `${data.orderNumber}` });
          navigate(`/orders/${data.id}`);
        }
      },
      onError: (e: any) => toast({ title: "Failed to create order", description: e?.error ?? "", variant: "destructive" }),
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
      toast({ title: "Select a customer", variant: "destructive" });
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
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Order</h1>
          <p className="text-muted-foreground text-sm">Customer details auto-fill on selection</p>
        </div>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Customer *</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
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
                    <span>Phone: {c.phone}</span>
                    <span>Email: {c.email}</span>
                    <span>Payment: <span className="capitalize">{c.paymentTerms?.replace(/_/g, " ")}</span></span>
                    {c.discountLevel && <span>Discount: {c.discountLevel}%</span>}
                    <span>Channel: <span className="capitalize">{c.businessChannel}</span></span>
                  </div>
                  {defaultAddr ? (
                    <div className="text-muted-foreground">
                      Default delivery: {defaultAddr.street}, {defaultAddr.postalCode} {defaultAddr.city}
                    </div>
                  ) : (
                    <div className="text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> No default delivery address on file
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Order Items</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Product</Label>
                  <Select value={productPick} onValueChange={setProductPick}>
                    <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
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
                  <Label>Qty</Label>
                  <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className="min-w-0" />
                </div>
                <Button type="button" onClick={addItem} disabled={!productPick}>
                  <Plus className="h-4 w-4 mr-1" />Add
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
                              : { status: "not_allocated" as const, label: "Not Allocated" };
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
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No items yet — add at least one</p>
              )}

              {cartPoolWarnings.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Stock warning — {poolLabel} pool:</p>
                    {cartPoolWarnings.map((item, idx) => {
                      const ps = poolStockMap.get(item.productId)!;
                      const { label, allocated } = calculateInventoryStatus(ps.available, ps.reserved);
                      return (
                        <p key={idx}>
                          {item.productName}: {ps.available} of {allocated} available ({label})
                        </p>
                      );
                    })}
                    <p className="mt-0.5 opacity-70">The order will still be saved.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Delivery & Notes</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label>Requested Delivery Date *</Label>
                <Input type="date" value={requestedDeliveryDate} onChange={e => setRequestedDeliveryDate(e.target.value)} />
              </div>
              <div>
                <Label>Urgency</Label>
                <Select value={urgency} onValueChange={setUrgency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Order Source</Label>
                <Select value={orderSource} onValueChange={setOrderSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="sales_rep">Sales Rep</SelectItem>
                    <SelectItem value="b2b">B2B</SelectItem>
                    <SelectItem value="direct">Direct</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="sample">Sample</SelectItem>
                    <SelectItem value="free_issue">Free Issue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Channel</Label>
                <Select value={businessChannel} onValueChange={setBusinessChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horeca">HoReCa</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <textarea
                  className="w-full text-sm border rounded-md p-2 h-20 resize-none bg-background"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Special instructions, etc."
                />
              </div>
              {isSampleOrder && (
                <>
                  <div className="col-span-2">
                    <Label>Sample / Free Issue Reason</Label>
                    <Input
                      value={sampleReason}
                      onChange={e => setSampleReason(e.target.value)}
                      placeholder="e.g. New customer intro, product trial..."
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Event / Campaign Name <span className="text-muted-foreground">(optional)</span></Label>
                    <Input
                      value={sampleEventName}
                      onChange={e => setSampleEventName(e.target.value)}
                      placeholder="e.g. Summer 2026 Campaign"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-4">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Completeness</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <CheckRow ok={!!cid} label="Customer selected" />
              <CheckRow ok={hasItems} label="At least one item" />
              <CheckRow ok={hasDate} label="Delivery date set" />
              <CheckRow ok={hasAddr} label="Delivery address available" />
              <div className="pt-2 border-t mt-3 text-xs">
                {isComplete ? (
                  <p className="text-green-700">Will be created and immediately set to <strong>planned</strong> with an auto-created delivery.</p>
                ) : (
                  <p className="text-amber-700">Will be saved as <strong>incomplete</strong> until items, a delivery address, and a delivery date are all set.</p>
                )}
              </div>
              {stockWarnings.length > 0 && (
                <div className="text-xs bg-red-50 border border-red-200 rounded p-2 mt-2 space-y-1">
                  <p className="font-semibold text-red-800">Stock warnings — order was saved:</p>
                  {stockWarnings.map((w, i) => (
                    <p key={i} className="text-red-700">{w.productName}: requested {w.requested}, only {w.available} available in {w.poolName}</p>
                  ))}
                </div>
              )}
              <Button type="submit" disabled={!cid || create.isPending} className="w-full mt-3">
                {create.isPending ? "Creating..." : "Create Order"}
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
