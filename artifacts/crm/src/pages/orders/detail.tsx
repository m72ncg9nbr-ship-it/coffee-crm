import { useParams, Link, useLocation } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrder,
  useUpdateOrder,
  useAddOrderItem,
  useDeleteOrderItem,
  useSendOrderToPlanning,
  useListProducts,
  useListCustomerAddresses,
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
import { ArrowLeft, Trash2, Send, AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

export default function OrderDetailPage() {
  const { id } = useParams();
  const orderId = Number(id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: order, isLoading, refetch } = useGetOrder(orderId, {
    query: { enabled: !!orderId } as any,
  });
  const { data: products } = useListProducts();
  const o = order as any;
  const customerId = o?.customer?.id;
  const { data: addresses } = useListCustomerAddresses(customerId ?? 0, {
    query: { enabled: !!customerId } as any,
  });

  const updateOrder = useUpdateOrder();
  const addItem = useAddOrderItem();
  const deleteItem = useDeleteOrderItem();
  const sendToPlanning = useSendOrderToPlanning();

  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [deliveryDate, setDeliveryDate] = useState("");

  const refresh = async () => {
    await refetch();
    qc.invalidateQueries({ queryKey: ["/api/orders"] });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!o) return <div className="p-6 text-muted-foreground">Order not found</div>;

  const items = (o.items ?? []) as any[];
  const customer = o.customer as any | null;
  const addressList = (addresses ?? []) as any[];
  const hasDeliveryAddress = addressList.some((a) => a.isDeliveryAddress);

  const isEditable = ["new", "incomplete"].includes(o.status);
  const isIncomplete = o.status === "incomplete";
  const missingItems = items.length === 0;
  const missingDate = !o.requestedDeliveryDate;
  const missingAddress = !hasDeliveryAddress;
  const cannotSend = isIncomplete || missingItems || missingDate || missingAddress || o.status === "blocked";

  const productList = (products ?? []) as any[];
  const selectedProduct = productList.find((p) => String(p.id) === productId);

  const onAddItem = async () => {
    if (!productId || !selectedProduct) return;
    const qty = Number(quantity);
    if (!qty || qty < 1) return;
    try {
      await addItem.mutateAsync({
        id: orderId,
        data: {
          productId: Number(productId),
          quantity: qty,
          unitPriceSnapshot: Number(selectedProduct.unitPrice ?? 0),
        },
      });
      setProductId("");
      setQuantity("1");
      toast({ title: "Item added" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not add item", description: e?.message ?? "Error", variant: "destructive" });
    }
  };

  const onDeleteItem = async (itemId: number) => {
    try {
      await deleteItem.mutateAsync({ id: orderId, itemId });
      toast({ title: "Item removed" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not remove item", description: e?.message ?? "Error", variant: "destructive" });
    }
  };

  const onSaveDate = async () => {
    if (!deliveryDate) return;
    try {
      await updateOrder.mutateAsync({
        id: orderId,
        data: { requestedDeliveryDate: deliveryDate } as any,
      });
      setDeliveryDate("");
      toast({ title: "Delivery date saved" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not save date", description: e?.message ?? "Error", variant: "destructive" });
    }
  };

  const onSendToPlanning = async () => {
    try {
      await sendToPlanning.mutateAsync({ id: orderId });
      toast({ title: "Sent to planning", description: "Delivery has been created" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not send", description: e?.message ?? "Order is still incomplete", variant: "destructive" });
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      incomplete: "bg-amber-100 text-amber-800 border-amber-200",
      blocked: "bg-red-100 text-red-800 border-red-200",
      new: "bg-blue-100 text-blue-800 border-blue-200",
      planned: "bg-purple-100 text-purple-800 border-purple-200",
      out_for_delivery: "bg-indigo-100 text-indigo-800 border-indigo-200",
      awaiting_accounting_approval: "bg-orange-100 text-orange-800 border-orange-200",
      approved: "bg-green-100 text-green-800 border-green-200",
      cancelled: "bg-gray-100 text-gray-700 border-gray-200",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${colors[status] ?? colors.new}`}>
        {status.replace(/_/g, " ")}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/orders">
          <Button variant="ghost" size="sm" data-testid="link-back-orders">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Orders
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" data-testid="text-order-number">{o.orderNumber ?? `Order #${o.id}`}</h1>
            {statusBadge(o.status)}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {customer ? (
              <Link href={`/customers/${customer.id}`} className="text-primary hover:underline" data-testid="link-customer">
                {customer.companyName}
              </Link>
            ) : "Unknown customer"}
            {" · "}
            {o.businessChannel} · {o.orderSource} · urgency {o.urgency}
          </p>
        </div>
        <Button
          onClick={onSendToPlanning}
          disabled={sendToPlanning.isPending || cannotSend}
          data-testid="button-send-to-planning"
        >
          <Send className="h-4 w-4 mr-1.5" />
          {sendToPlanning.isPending ? "Sending..." : "Send to planning"}
        </Button>
      </div>

      {isIncomplete && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="font-medium text-amber-900">This order is incomplete</p>
                <p className="text-sm text-amber-800">Resolve the items below before sending to planning:</p>
                <ul className="text-sm text-amber-800 space-y-1 mt-1">
                  <li className="flex items-center gap-2">
                    {missingItems
                      ? <AlertTriangle className="h-3.5 w-3.5" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                    At least one order item
                  </li>
                  <li className="flex items-center gap-2">
                    {missingDate
                      ? <AlertTriangle className="h-3.5 w-3.5" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                    Requested delivery date
                  </li>
                  <li className="flex items-center gap-2">
                    {missingAddress
                      ? <AlertTriangle className="h-3.5 w-3.5" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                    Customer must have a delivery address
                  </li>
                </ul>
                {missingAddress && customer && (
                  <p className="text-sm text-amber-800 pt-1">
                    <Link href={`/customers/${customer.id}`} className="underline font-medium" data-testid="link-fix-address">
                      Open customer to add a delivery address →
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-sm">Items</CardTitle>
            <span className="text-sm font-medium" data-testid="text-total">
              Total: {Number(o.totalAmount ?? 0).toLocaleString("nb-NO", { style: "currency", currency: "NOK" })}
            </span>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No items yet. Add the first one below.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-card"
                    data-testid={`row-item-${item.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} × {Number(item.unitPriceSnapshot).toLocaleString("nb-NO", { style: "currency", currency: "NOK" })}
                      </p>
                    </div>
                    <p className="text-sm font-medium">
                      {Number(item.lineTotal).toLocaleString("nb-NO", { style: "currency", currency: "NOK" })}
                    </p>
                    {isEditable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteItem(item.id)}
                        disabled={deleteItem.isPending}
                        aria-label={`Remove ${item.productName}`}
                        data-testid={`button-delete-item-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isEditable && (
              <div className="mt-4 pt-4 border-t space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase">Add Item</p>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2">
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger data-testid="select-product">
                      <SelectValue placeholder="Choose product" />
                    </SelectTrigger>
                    <SelectContent>
                      {productList.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.productName} — {Number(p.unitPrice ?? 0).toLocaleString("nb-NO", { style: "currency", currency: "NOK" })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Qty"
                    data-testid="input-quantity"
                  />
                  <Button
                    onClick={onAddItem}
                    disabled={addItem.isPending || !productId}
                    data-testid="button-add-item"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Delivery</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Requested date</Label>
                <p className="text-sm font-medium" data-testid="text-delivery-date">
                  {o.requestedDeliveryDate ? formatDate(o.requestedDeliveryDate) : "Not set"}
                </p>
              </div>
              {isEditable && (
                <div className="space-y-2">
                  <Input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    data-testid="input-delivery-date"
                  />
                  <Button
                    size="sm"
                    onClick={onSaveDate}
                    disabled={updateOrder.isPending || !deliveryDate}
                    className="w-full"
                    data-testid="button-save-date"
                  >
                    {updateOrder.isPending ? "Saving..." : "Save date"}
                  </Button>
                </div>
              )}
              <div className="pt-2 border-t">
                <Label className="text-xs text-muted-foreground">Delivery address</Label>
                {hasDeliveryAddress ? (
                  <p className="text-sm" data-testid="text-delivery-address">
                    {addressList.filter((a) => a.isDeliveryAddress).map((a) => `${a.street}, ${a.postalCode} ${a.city}`).join(" · ")}
                  </p>
                ) : (
                  <p className="text-sm text-amber-700">
                    No delivery address.{" "}
                    {customer && (
                      <Link href={`/customers/${customer.id}`} className="underline">
                        Add one →
                      </Link>
                    )}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {o.notes && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap" data-testid="text-notes">{o.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
