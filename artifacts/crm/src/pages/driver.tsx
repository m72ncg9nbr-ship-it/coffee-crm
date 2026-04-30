import { useState } from "react";
import { useListDeliveries, useUpdateDelivery, useGetDelivery, useLogout, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { StatusBadge, UrgencyBadge } from "@/components/priority-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { MapPin, Truck, CheckCircle, Navigation, LogOut, Phone, User, FileText, Hash, History, AlertCircle, Camera, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_TRANSITIONS: Record<string, { next: string; label: string; className: string }> = {
  assigned: { next: "arrived", label: "Mark Arrived", className: "bg-purple-600 hover:bg-purple-700 text-white border-purple-600" },
};

const DEVIATION_OPTIONS = [
  { value: "none", label: "No deviation" },
  { value: "damaged_goods", label: "Damaged goods" },
  { value: "missing_items", label: "Missing items" },
  { value: "delayed_delivery", label: "Delayed delivery" },
  { value: "not_delivered", label: "Not delivered" },
  { value: "customer_absent", label: "Customer not on site" },
  { value: "wrong_address", label: "Wrong address" },
  { value: "other", label: "Other" },
];

const DOCUMENT_TYPE_OPTIONS = [
  { value: "delivery_proof", label: "Signed delivery note" },
  { value: "waybill", label: "Waybill / dispatch note" },
  { value: "product_photo", label: "Product photo" },
  { value: "other", label: "Other proof" },
];

const HISTORY_STATUSES = ["awaiting_accounting_approval", "approved", "issue_reported"];
const ACTIVE_STATUSES = ["assigned", "arrived"];

type UploadVariables = {
  deliveryId: number;
  file: File;
  documentType: string;
  notes?: string | null;
  deviationType?: string | null;
  deviationNote?: string | null;
};

async function uploadDeliveryDocumentMultipart(vars: UploadVariables): Promise<any> {
  const form = new FormData();
  form.append("file", vars.file);
  form.append("documentType", vars.documentType);
  if (vars.notes) form.append("notes", vars.notes);
  if (vars.deviationType) form.append("deviationType", vars.deviationType);
  if (vars.deviationNote) form.append("deviationNote", vars.deviationNote);

  const res = await fetch(`/api/deliveries/${vars.deliveryId}/documents`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* fall through */
    }
    throw new Error(message);
  }
  return res.json();
}

export default function DriverPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        window.location.href = "/login";
      },
    },
  });
  const { data: deliveries, isLoading, refetch } = useListDeliveries();
  const [tab, setTab] = useState<"active" | "history">("active");
  const [uploadFor, setUploadFor] = useState<any | null>(null);
  const [detailFor, setDetailFor] = useState<number | null>(null);
  const [documentType, setDocumentType] = useState<string>("delivery_proof");
  const [file, setFile] = useState<File | null>(null);
  const [deviationType, setDeviationType] = useState<string>("none");
  const [deviationNote, setDeviationNote] = useState<string>("");
  const [submitNote, setSubmitNote] = useState<string>("");

  const updateDelivery = useUpdateDelivery({
    mutation: {
      onSuccess: () => {
        refetch();
        toast({ title: "Status updated" });
      },
      onError: () => toast({ title: "Failed to update status", variant: "destructive" })
    }
  });

  const uploadDoc = useMutation({
    mutationFn: uploadDeliveryDocumentMultipart,
    onSuccess: () => {
      refetch();
      toast({ title: "Documentation uploaded" });
      resetUploadDialog();
    },
    onError: (err: Error) =>
      toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const resetUploadDialog = () => {
    setUploadFor(null);
    setDocumentType("delivery_proof");
    setFile(null);
    setDeviationType("none");
    setDeviationNote("");
    setSubmitNote("");
  };

  const myAll = (deliveries ?? []).filter((d: any) => d.driverId === user?.id);
  const myActive = myAll.filter((d: any) => ACTIVE_STATUSES.includes(d.status));
  const myHistory = myAll.filter((d: any) => HISTORY_STATUSES.includes(d.status));

  const today = new Date().toISOString().split("T")[0];
  const todayDeliveries = myActive.filter((d: any) => d.scheduledDate?.startsWith(today));
  const upcomingDeliveries = myActive.filter((d: any) => d.scheduledDate > today);

  const todayHistory = myHistory.filter((d: any) => d.scheduledDate?.startsWith(today));
  const earlierHistory = myHistory.filter((d: any) => !d.scheduledDate?.startsWith(today));

  const submitUpload = () => {
    if (!uploadFor) return;
    if (!file) {
      toast({ title: "Please choose a file", variant: "destructive" });
      return;
    }
    uploadDoc.mutate({
      deliveryId: uploadFor.id,
      file,
      documentType,
      notes: submitNote || null,
      deviationType: deviationType !== "none" ? deviationType : null,
      deviationNote: deviationType !== "none" && deviationNote ? deviationNote : null,
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-4 shadow-md">
        <div className="flex items-center gap-3">
          <Truck className="h-6 w-6" />
          <div className="flex-1">
            <h1 className="font-bold text-lg">Driver View</h1>
            <p className="text-primary-foreground/80 text-sm">Hi, {user?.fullName}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate(undefined as any)}
            disabled={logout.isPending}
            className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            data-testid="button-driver-logout"
          >
            <LogOut className="h-4 w-4 mr-1" />
            Sign out
          </Button>
        </div>

        <div className="flex gap-1 mt-3 bg-primary-foreground/10 rounded-md p-1">
          <button
            onClick={() => setTab("active")}
            className={`flex-1 py-1.5 text-sm font-medium rounded transition-colors ${tab === "active" ? "bg-white text-primary" : "text-primary-foreground/80"}`}
            data-testid="tab-active"
          >
            Active ({myActive.length})
          </button>
          <button
            onClick={() => setTab("history")}
            className={`flex-1 py-1.5 text-sm font-medium rounded transition-colors flex items-center justify-center gap-1 ${tab === "history" ? "bg-white text-primary" : "text-primary-foreground/80"}`}
            data-testid="tab-history"
          >
            <History className="h-3.5 w-3.5" />
            History ({myHistory.length})
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5 max-w-lg mx-auto">
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground">Loading your deliveries...</div>
        )}

        {!isLoading && tab === "active" && (
          <>
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Today — {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              {todayDeliveries.length === 0 && (
                <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No deliveries for today</p>
                </div>
              )}
              <div className="space-y-3">
                {todayDeliveries.map((d: any) => (
                  <DriverDeliveryCard
                    key={d.id}
                    delivery={d}
                    onAdvance={next => updateDelivery.mutate({ id: d.id, data: { status: next as any } })}
                    onUpload={() => setUploadFor(d)}
                    onOpenDetails={() => setDetailFor(d.id)}
                    isPending={updateDelivery.isPending || uploadDoc.isPending}
                  />
                ))}
              </div>
            </section>

            {upcomingDeliveries.length > 0 && (
              <section>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Upcoming</h2>
                <div className="space-y-3">
                  {upcomingDeliveries.map((d: any) => (
                    <DriverDeliveryCard
                      key={d.id}
                      delivery={d}
                      upcoming
                      onAdvance={next => updateDelivery.mutate({ id: d.id, data: { status: next as any } })}
                      onUpload={() => setUploadFor(d)}
                      onOpenDetails={() => setDetailFor(d.id)}
                      isPending={updateDelivery.isPending || uploadDoc.isPending}
                    />
                  ))}
                </div>
              </section>
            )}

            {myActive.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Truck className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="font-medium">No deliveries assigned</p>
                <p className="text-sm mt-1">Check with operations for your schedule</p>
              </div>
            )}
          </>
        )}

        {!isLoading && tab === "history" && (
          <>
            {todayHistory.length > 0 && (
              <section>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Completed today</h2>
                <div className="space-y-3">
                  {todayHistory.map((d: any) => (
                    <DriverDeliveryCard
                      key={d.id}
                      delivery={d}
                      historical
                      onOpenDetails={() => setDetailFor(d.id)}
                    />
                  ))}
                </div>
              </section>
            )}
            {earlierHistory.length > 0 && (
              <section>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Earlier</h2>
                <div className="space-y-3">
                  {earlierHistory.map((d: any) => (
                    <DriverDeliveryCard
                      key={d.id}
                      delivery={d}
                      historical
                      onOpenDetails={() => setDetailFor(d.id)}
                    />
                  ))}
                </div>
              </section>
            )}
            {myHistory.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <History className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="font-medium">No completed deliveries yet</p>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={!!uploadFor} onOpenChange={(open) => { if (!open) resetUploadDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submit Delivery</DialogTitle>
            <DialogDescription>
              Attach a document or photo. The delivery is not complete until proof is uploaded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/40 rounded-md p-3 text-sm">
              <p className="font-medium">{uploadFor?.customerName}</p>
              <p className="text-muted-foreground text-xs mt-0.5">{uploadFor?.deliveryNumber} · {uploadFor?.orderNumber}</p>
            </div>

            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger data-testid="select-document-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="driver-file">File / photo</Label>
              <Input
                id="driver-file"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="input-driver-file"
              />
              {file && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Camera className="h-3 w-3" />
                  {file.name}
                  <span className="text-[10px]">({Math.round(file.size / 1024)} KB)</span>
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">Image or PDF, up to 10 MB.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea
                placeholder="e.g. Handed over to reception"
                value={submitNote}
                onChange={(e) => setSubmitNote(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5 border-t pt-3">
              <Label>Deviation</Label>
              <Select value={deviationType} onValueChange={setDeviationType}>
                <SelectTrigger data-testid="select-deviation-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEVIATION_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {deviationType !== "none" && (
              <div className="space-y-1.5">
                <Label>Deviation note</Label>
                <Textarea
                  placeholder="Describe what happened..."
                  value={deviationNote}
                  onChange={e => setDeviationNote(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-orange-700">
                  Operations will be notified to follow up.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              The delivery will be sent to accounting for review.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetUploadDialog}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={uploadDoc.isPending || !file}
              onClick={submitUpload}
              data-testid="button-submit-upload"
            >
              {uploadDoc.isPending ? "Uploading..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeliveryDetailDialog deliveryId={detailFor} onClose={() => setDetailFor(null)} />
    </div>
  );
}

function DeliveryDetailDialog({ deliveryId, onClose }: { deliveryId: number | null; onClose: () => void }) {
  const { data, isLoading } = useGetDelivery(deliveryId ?? 0, {
    query: { enabled: !!deliveryId } as any,
  });
  const d: any = data;

  return (
    <Dialog open={!!deliveryId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Delivery Details</DialogTitle>
          <DialogDescription>
            {d ? `${d.deliveryNumber} · ${d.orderNumber ?? "—"}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {d && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-base">{d.customerName}</p>
                <p className="text-muted-foreground capitalize text-xs">{d.businessChannel}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <UrgencyBadge urgency={d.urgency} />
                <StatusBadge status={d.status} />
              </div>
            </div>

            <div className="bg-muted/40 rounded-md p-3 space-y-2">
              {d.contactPerson && (
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{d.contactPerson}</span>
                </div>
              )}
              {d.contactPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={`tel:${d.contactPhone}`} className="text-primary hover:underline">{d.contactPhone}</a>
                </div>
              )}
              {d.plannedSequence != null && (
                <div className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Sequence #{d.plannedSequence}</span>
                </div>
              )}
            </div>

            {d.deliveryAddress && (
              <div className="flex items-start gap-2 bg-muted/30 rounded-md p-3">
                <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="text-sm flex-1">
                  <p className="font-medium">{d.deliveryAddress.street}</p>
                  <p className="text-muted-foreground">{d.deliveryAddress.postalCode} {d.deliveryAddress.city}</p>
                  {d.deliveryAddress.notes && (
                    <p className="text-xs text-orange-700 mt-1.5">📝 {d.deliveryAddress.notes}</p>
                  )}
                </div>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(`${d.deliveryAddress?.street ?? ""}, ${d.deliveryAddress?.city ?? ""}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    <Navigation className="h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
            )}

            {d.items && d.items.length > 0 && (
              <div>
                <p className="font-semibold mb-2 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Order summary</p>
                <ul className="bg-muted/30 rounded-md p-3 space-y-1">
                  {d.items.map((it: any) => (
                    <li key={it.id} className="flex justify-between gap-2">
                      <span className="text-sm">{it.productName}</span>
                      <span className="text-sm text-muted-foreground">× {it.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.orderNotes && (
              <div>
                <p className="font-semibold mb-1 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Special note</p>
                <p className="bg-amber-50 border border-amber-200 rounded-md p-2.5 text-sm">{d.orderNotes}</p>
              </div>
            )}

            {d.deviationType && (
              <div className="flex items-start gap-2 text-orange-700 bg-orange-50 border border-orange-200 rounded-md p-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium capitalize">{d.deviationType.replace(/_/g, " ")}</p>
                  {d.deviationNote && <p className="text-xs mt-0.5">{d.deviationNote}</p>}
                </div>
              </div>
            )}

            {d.documents && d.documents.length > 0 && (
              <div>
                <p className="font-semibold mb-1 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Documents</p>
                <ul className="space-y-1">
                  {d.documents.map((doc: any) => (
                    <li key={doc.id} className="text-xs text-muted-foreground">
                      <span className="capitalize">{doc.documentType?.replace(/_/g, " ")}</span> · {formatDate(doc.createdAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DriverDeliveryCard({ delivery: d, onAdvance, onUpload, onOpenDetails, isPending, upcoming, historical }: {
  delivery: any;
  onAdvance?: (next: string) => void;
  onUpload?: () => void;
  onOpenDetails?: () => void;
  isPending?: boolean;
  upcoming?: boolean;
  historical?: boolean;
}) {
  const transition = STATUS_TRANSITIONS[d.status];

  return (
    <Card className={upcoming || historical ? "opacity-90" : ""}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold flex items-center gap-1.5">
              {d.plannedSequence != null && (
                <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold px-1.5">
                  {d.plannedSequence}
                </span>
              )}
              <span className="truncate">{d.customerName}</span>
            </p>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">
              {d.deliveryNumber}{d.orderNumber ? ` · ${d.orderNumber}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <UrgencyBadge urgency={d.urgency} />
            <StatusBadge status={d.status} />
          </div>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <p>📅 {formatDate(d.scheduledDate)}</p>
          {d.contactPerson && (
            <p className="flex items-center gap-1.5">
              <User className="h-3 w-3" /> {d.contactPerson}
            </p>
          )}
          {d.contactPhone && (
            <p className="flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              <a href={`tel:${d.contactPhone}`} className="text-primary hover:underline">{d.contactPhone}</a>
            </p>
          )}
        </div>

        {d.deliveryAddress && (
          <div className="flex items-start gap-2 bg-muted/30 rounded-md p-3">
            <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="text-sm flex-1">
              <p className="font-medium">{d.deliveryAddress.street}</p>
              <p className="text-muted-foreground">{d.deliveryAddress.postalCode} {d.deliveryAddress.city}</p>
            </div>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(`${d.deliveryAddress?.street ?? ""}, ${d.deliveryAddress?.city ?? ""}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <Navigation className="h-3.5 w-3.5" />
              </Button>
            </a>
          </div>
        )}

        {d.orderNotes && !historical && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-2.5 text-xs text-amber-900">
            📝 {d.orderNotes}
          </div>
        )}

        {d.deviationType && (
          <div className="flex items-start gap-2 text-orange-700 bg-orange-50 border border-orange-200 rounded-md p-2 text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium capitalize">{d.deviationType.replace(/_/g, " ")}</span>
              {d.deviationNote && <p className="mt-0.5">{d.deviationNote}</p>}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onOpenDetails}
            data-testid={`button-details-${d.id}`}
          >
            <FileText className="h-3.5 w-3.5 mr-1" />
            Details
          </Button>
        </div>

        {!historical && transition && (
          <Button
            className={`w-full font-semibold ${transition.className}`}
            onClick={() => onAdvance?.(transition.next)}
            disabled={isPending}
            data-testid={`button-arrived-${d.id}`}
          >
            {transition.label}
          </Button>
        )}

        {!historical && d.status === "arrived" && (
          <Button
            className="w-full font-semibold bg-green-600 hover:bg-green-700 text-white border-green-600"
            onClick={() => onUpload?.()}
            disabled={isPending}
            data-testid={`button-upload-${d.id}`}
          >
            Upload Documentation
          </Button>
        )}

        {d.status === "awaiting_accounting_approval" && (
          <div className="text-sm text-amber-700 bg-amber-50 rounded-md p-2.5 text-center font-medium">
            Awaiting accounting review
          </div>
        )}

        {d.status === "approved" && (
          <div className="text-sm text-green-700 bg-green-50 rounded-md p-2.5 text-center font-medium flex items-center justify-center gap-1.5">
            <CheckCircle className="h-4 w-4" /> Approved
          </div>
        )}
      </CardContent>
    </Card>
  );
}
