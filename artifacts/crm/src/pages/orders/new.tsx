import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  useListCustomers,
  useGetCustomer,
  useListCustomerAddresses,
  useListProducts,
  useCreateOrder,
} from "@workspace/api-client-react";
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
  const { data: customers } = useListCustomers();
  const { data: products } = useListProducts();

  const [customerId, setCustomerId] = useState<string>("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [urgency, setUrgency] = useState<string>("normal");
  const [orderSource, setOrderSource] = useState("phone");
  const [businessChannel, setBusinessChannel] = useState("horeca");
  const [notes, setNotes] = useState("");
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

  const create = useCreateOrder({
    mutation: {
      onSuccess: (data: any) => {
        toast({ title: "Order created", description: `${data.orderNumber}` });
        navigate(`/orders/${data.id}`);
      },
      onError: (e: any) => toast({ title: "Failed to create order", description: e?.error ?? "", variant: "destructive" }),
    },
  });

  const total = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unitPriceSnapshot, 0), [items]);

  function addItem() {
    const pid = Number(productPick);
    const qn = Number(qty);
    if (!pid || qn <= 0) return;
    const p = (products ?? []).find((x: any) => x.id === pid) as any;
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
                    {(customers ?? []).map((c: any) => (
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
                      {(products ?? []).map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.productName} — {formatCurrency(parseFloat(p.unitPrice))}/{p.unit ?? "ea"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <Label>Qty</Label>
                  <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} />
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
                        <div className="font-medium">{i.productName}</div>
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
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="sales_rep">Sales Rep</SelectItem>
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
