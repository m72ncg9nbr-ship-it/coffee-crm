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
import { useLang } from "@/lib/lang-context";
import { t, type DictKey } from "@/lib/i18n";

const STATUS_TRANSITIONS: Record<string, { next: string; labelKey: DictKey; className: string }> = {
  assigned: { next: "arrived", labelKey: "markArrived", className: "bg-purple-600 hover:bg-purple-700 text-white border-purple-600" },
};

const ISSUE_TYPE_KEYS: { value: string; labelKey: DictKey }[] = [
  { value: "damaged_goods",    labelKey: "issueDamagedGoods" },
  { value: "missing_items",    labelKey: "issueMissingItems2" },
  { value: "customer_absent",  labelKey: "issueCustomerAbsent2" },
  { value: "wrong_address",    labelKey: "issueWrongAddress" },
  { value: "access_denied",    labelKey: "issueAccessDenied" },
  { value: "delayed_delivery", labelKey: "issueDelayedDelivery" },
  { value: "other",            labelKey: "issueOther2" },
];

const DEVIATION_OPTION_KEYS: { value: string; labelKey: DictKey }[] = [
  { value: "none",             labelKey: "noDeviation" },
  { value: "damaged_goods",    labelKey: "devDamagedGoods" },
  { value: "missing_items",    labelKey: "devMissingItems" },
  { value: "delayed_delivery", labelKey: "devDelayedDelivery" },
  { value: "not_delivered",    labelKey: "notDelivered" },
  { value: "customer_absent",  labelKey: "devCustomerAbsent" },
  { value: "wrong_address",    labelKey: "devWrongAddress2" },
  { value: "other",            labelKey: "devOther2" },
];

const DOCUMENT_TYPE_KEYS: { value: string; labelKey: DictKey }[] = [
  { value: "delivery_proof", labelKey: "docSignedNote" },
  { value: "waybill",        labelKey: "docWaybill" },
  { value: "product_photo",  labelKey: "docProductPhoto" },
  { value: "other",          labelKey: "docOtherProof" },
];

const HISTORY_STATUSES = ["awaiting_accounting_approval", "approved"];
const ACTIVE_STATUSES = ["assigned", "arrived", "issue_reported"];

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
  const { lang } = useLang();
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

  // Issue lifecycle state
  const [issueReportFor, setIssueReportFor] = useState<any | null>(null);
  const [issueType, setIssueType] = useState<string>("other");
  const [issueNote, setIssueNote] = useState<string>("");
  const [resolveFor, setResolveFor] = useState<any | null>(null);
  const [resolveNote, setResolveNote] = useState<string>("");

  const updateDelivery = useUpdateDelivery({
    mutation: {
      onSuccess: () => {
        refetch();
        toast({ title: t("statusUpdated", lang) });
      },
      onError: () => toast({ title: t("failedToUpdateStatus", lang), variant: "destructive" })
    }
  });

  const uploadDoc = useMutation({
    mutationFn: uploadDeliveryDocumentMultipart,
    onSuccess: () => {
      refetch();
      toast({ title: t("documentUploaded", lang) });
      resetUploadDialog();
    },
    onError: (err: Error) =>
      toast({ title: t("uploadFailed", lang), description: err.message, variant: "destructive" }),
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
      toast({ title: t("pleaseChooseFile", lang), variant: "destructive" });
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

  const submitReportIssue = () => {
    if (!issueReportFor) return;
    if (!issueNote.trim()) {
      toast({ title: t("pleaseDescribeIssue", lang), variant: "destructive" });
      return;
    }
    updateDelivery.mutate({
      id: issueReportFor.id,
      data: { status: "issue_reported" as any, deviationType: issueType, deviationNote: issueNote },
    });
    setIssueReportFor(null);
    setIssueType("other");
    setIssueNote("");
  };

  const submitResolveIssue = () => {
    if (!resolveFor) return;
    updateDelivery.mutate({
      id: resolveFor.id,
      data: { status: "arrived" as any, resolutionNote: resolveNote || undefined } as any,
    });
    setResolveFor(null);
    setResolveNote("");
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-4 shadow-md">
        <div className="flex items-center gap-3">
          <Truck className="h-6 w-6" />
          <div className="flex-1">
            <h1 className="font-bold text-lg">{t("driverView", lang)}</h1>
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
            {t("signOut", lang)}
          </Button>
        </div>

        <div className="flex gap-1 mt-3 bg-primary-foreground/10 rounded-md p-1">
          <button
            onClick={() => setTab("active")}
            className={`flex-1 py-1.5 text-sm font-medium rounded transition-colors ${tab === "active" ? "bg-white text-primary" : "text-primary-foreground/80"}`}
            data-testid="tab-active"
          >
            {t("activeStatus", lang)} ({myActive.length})
          </button>
          <button
            onClick={() => setTab("history")}
            className={`flex-1 py-1.5 text-sm font-medium rounded transition-colors flex items-center justify-center gap-1 ${tab === "history" ? "bg-white text-primary" : "text-primary-foreground/80"}`}
            data-testid="tab-history"
          >
            <History className="h-3.5 w-3.5" />
            {t("historyTab", lang)} ({myHistory.length})
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5 max-w-lg mx-auto">
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground">{t("loading", lang)}</div>
        )}

        {!isLoading && tab === "active" && (
          <>
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Today — {new Date().toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              {todayDeliveries.length === 0 && (
                <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t("noDeliveriesToday", lang)}</p>
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
                    onReportIssue={() => { setIssueReportFor(d); setIssueType("other"); setIssueNote(""); }}
                    onResolveIssue={() => { setResolveFor(d); setResolveNote(""); }}
                    isPending={updateDelivery.isPending || uploadDoc.isPending}
                  />
                ))}
              </div>
            </section>

            {upcomingDeliveries.length > 0 && (
              <section>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">{t("upcomingDeliveries", lang)}</h2>
                <div className="space-y-3">
                  {upcomingDeliveries.map((d: any) => (
                    <DriverDeliveryCard
                      key={d.id}
                      delivery={d}
                      upcoming
                      onAdvance={next => updateDelivery.mutate({ id: d.id, data: { status: next as any } })}
                      onUpload={() => setUploadFor(d)}
                      onOpenDetails={() => setDetailFor(d.id)}
                      onReportIssue={() => { setIssueReportFor(d); setIssueType("other"); setIssueNote(""); }}
                      onResolveIssue={() => { setResolveFor(d); setResolveNote(""); }}
                      isPending={updateDelivery.isPending || uploadDoc.isPending}
                    />
                  ))}
                </div>
              </section>
            )}

            {myActive.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Truck className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="font-medium">{t("noDeliveriesAssigned", lang)}</p>
                <p className="text-sm mt-1">{t("checkWithOperations", lang)}</p>
              </div>
            )}
          </>
        )}

        {!isLoading && tab === "history" && (
          <>
            {todayHistory.length > 0 && (
              <section>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">{t("completedToday", lang)}</h2>
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
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">{t("earlierDeliveries", lang)}</h2>
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
                <p className="font-medium">{t("noCompletedDeliveries", lang)}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Report Issue dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!issueReportFor} onOpenChange={(open) => { if (!open) { setIssueReportFor(null); setIssueNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reportIssue", lang)}</DialogTitle>
            <DialogDescription>{t("reportIssueDesc", lang)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/40 rounded-md p-3 text-sm">
              <p className="font-medium">{issueReportFor?.customerName}</p>
              <p className="text-muted-foreground text-xs mt-0.5">{issueReportFor?.deliveryNumber}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("issueTypeLabel", lang)}</Label>
              <Select value={issueType} onValueChange={setIssueType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ISSUE_TYPE_KEYS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{t(o.labelKey, lang)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("descriptionReq", lang)}</Label>
              <Textarea
                placeholder={t("describeWhatHappened", lang)}
                value={issueNote}
                onChange={e => setIssueNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIssueReportFor(null); setIssueNote(""); }}>{t("cancel", lang)}</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              disabled={updateDelivery.isPending || !issueNote.trim()}
              onClick={submitReportIssue}
            >
              <AlertCircle className="h-4 w-4 mr-1.5" />
              {t("reportIssue", lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resolve Issue dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!resolveFor} onOpenChange={(open) => { if (!open) { setResolveFor(null); setResolveNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("resolveIssue", lang)}</DialogTitle>
            <DialogDescription>{t("resolveIssueDesc", lang)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/40 rounded-md p-3 text-sm">
              <p className="font-medium">{resolveFor?.customerName}</p>
              <p className="text-muted-foreground text-xs mt-0.5">{resolveFor?.deliveryNumber}</p>
              {resolveFor?.deviationNote && (
                <p className="text-xs text-orange-700 mt-1.5">
                  <span className="font-medium">{t("issueReported", lang)}: </span>{resolveFor.deviationNote}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("resolutionNoteOpt", lang)}</Label>
              <Textarea
                placeholder={t("howWasIssueResolved", lang)}
                value={resolveNote}
                onChange={e => setResolveNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResolveFor(null); setResolveNote(""); }}>{t("cancel", lang)}</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={updateDelivery.isPending}
              onClick={submitResolveIssue}
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              {t("markResolved", lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!uploadFor} onOpenChange={(open) => { if (!open) resetUploadDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("submitDelivery", lang)}</DialogTitle>
            <DialogDescription>{t("submitDeliveryDesc", lang)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/40 rounded-md p-3 text-sm">
              <p className="font-medium">{uploadFor?.customerName}</p>
              <p className="text-muted-foreground text-xs mt-0.5">{uploadFor?.deliveryNumber} · {uploadFor?.orderNumber}</p>
            </div>

            <div className="space-y-1.5">
              <Label>{t("documentTypeLabel", lang)}</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger data-testid="select-document-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPE_KEYS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{t(o.labelKey, lang)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="driver-file">{t("filePhoto", lang)}</Label>
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
              <Label>{t("noteOptional", lang)}</Label>
              <Textarea
                placeholder="e.g. Handed over to reception"
                value={submitNote}
                onChange={(e) => setSubmitNote(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5 border-t pt-3">
              <Label>{t("deviationLabel", lang)}</Label>
              <Select value={deviationType} onValueChange={setDeviationType}>
                <SelectTrigger data-testid="select-deviation-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEVIATION_OPTION_KEYS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{t(o.labelKey, lang)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {deviationType !== "none" && (
              <div className="space-y-1.5">
                <Label>{t("deviationNoteLabel", lang)}</Label>
                <Textarea
                  placeholder={t("describeWhatHappened", lang)}
                  value={deviationNote}
                  onChange={e => setDeviationNote(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-orange-700">{t("operationsNotified", lang)}</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{t("sentToAccountingReview", lang)}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetUploadDialog}>{t("cancel", lang)}</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={uploadDoc.isPending || !file}
              onClick={submitUpload}
              data-testid="button-submit-upload"
            >
              {uploadDoc.isPending ? t("uploading", lang) : t("submitBtn", lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeliveryDetailDialog deliveryId={detailFor} onClose={() => setDetailFor(null)} />
    </div>
  );
}

function DeliveryDetailDialog({ deliveryId, onClose }: { deliveryId: number | null; onClose: () => void }) {
  const { lang } = useLang();
  const { data, isLoading } = useGetDelivery(deliveryId ?? 0, {
    query: { enabled: !!deliveryId } as any,
  });
  const d: any = data;

  return (
    <Dialog open={!!deliveryId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("deliveryDetails", lang)}</DialogTitle>
          <DialogDescription>
            {d ? `${d.deliveryNumber} · ${d.orderNumber ?? "—"}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">{t("loading", lang)}</p>}

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
                <p className="font-semibold mb-2 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> {t("orderSummary", lang)}</p>
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
                <p className="font-semibold mb-1 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {t("specialNote", lang)}</p>
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
                <p className="font-semibold mb-1 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {t("documentsLabel", lang)}</p>
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
          <Button variant="outline" onClick={onClose}>{t("close", lang)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DriverDeliveryCard({ delivery: d, onAdvance, onUpload, onOpenDetails, onReportIssue, onResolveIssue, isPending, upcoming, historical }: {
  delivery: any;
  onAdvance?: (next: string) => void;
  onUpload?: () => void;
  onOpenDetails?: () => void;
  onReportIssue?: () => void;
  onResolveIssue?: () => void;
  isPending?: boolean;
  upcoming?: boolean;
  historical?: boolean;
}) {
  const { lang } = useLang();
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
            {t("detailsBtn", lang)}
          </Button>
        </div>

        {/* Issue reported badge */}
        {d.status === "issue_reported" && (
          <div className="flex items-start gap-2 text-orange-800 bg-orange-50 border border-orange-200 rounded-md p-2.5 text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{t("issueReported", lang)}</p>
              {d.deviationNote && <p className="mt-0.5">{d.deviationNote}</p>}
              {d.resolutionNote && <p className="mt-0.5 text-green-800">{t("markResolved", lang)}: {d.resolutionNote}</p>}
            </div>
          </div>
        )}

        {!historical && transition && d.status !== "issue_reported" && (
          <Button
            className={`w-full font-semibold ${transition.className}`}
            onClick={() => onAdvance?.(transition.next)}
            disabled={isPending}
            data-testid={`button-arrived-${d.id}`}
          >
            {t(transition.labelKey, lang)}
          </Button>
        )}

        {!historical && d.status === "arrived" && (
          <div className="space-y-2">
            <Button
              className="w-full font-semibold bg-green-600 hover:bg-green-700 text-white border-green-600"
              onClick={() => onUpload?.()}
              disabled={isPending}
              data-testid={`button-upload-${d.id}`}
            >
              {t("uploadDocumentation", lang)}
            </Button>
            <Button
              variant="outline"
              className="w-full text-orange-700 border-orange-300 hover:bg-orange-50"
              onClick={() => onReportIssue?.()}
              disabled={isPending}
              data-testid={`button-report-issue-${d.id}`}
            >
              <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
              {t("reportIssue", lang)}
            </Button>
          </div>
        )}

        {!historical && d.status === "issue_reported" && (
          <Button
            className="w-full font-semibold bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => onResolveIssue?.()}
            disabled={isPending}
            data-testid={`button-resolve-issue-${d.id}`}
          >
            <CheckCircle className="h-4 w-4 mr-1.5" />
            {t("resolveIssue", lang)}
          </Button>
        )}

        {d.status === "awaiting_accounting_approval" && (
          <div className="text-sm text-amber-700 bg-amber-50 rounded-md p-2.5 text-center font-medium">
            {t("awaitingReview", lang)}
          </div>
        )}

        {d.status === "approved" && (
          <div className="text-sm text-green-700 bg-green-50 rounded-md p-2.5 text-center font-medium flex items-center justify-center gap-1.5">
            <CheckCircle className="h-4 w-4" /> {t("approved", lang)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
