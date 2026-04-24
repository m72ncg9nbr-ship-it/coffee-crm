import { useParams, Link } from "wouter";
import { useGetCustomer } from "@workspace/api-client-react";
import { PriorityBadge } from "@/components/priority-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Phone, MapPin, Building2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { data: customer, isLoading } = useGetCustomer(Number(id), {
    query: { enabled: !!id }
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!customer) return <div className="p-6 text-muted-foreground">Customer not found</div>;

  const c = customer as any;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/customers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Customers
          </Button>
        </Link>
      </div>

      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{c.companyName}</h1>
            <PriorityBadge priority={c.priorityClass} />
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
              {c.active ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="text-muted-foreground text-sm capitalize">{c.segment?.replace(/_/g, " ")} · {c.customerChannel} · {c.businessChannel}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Contact</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium w-28 shrink-0">Contact person</span>
              <span className="text-muted-foreground">{c.contactPerson}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{c.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Commercial Terms</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Row label="Payment Terms" value={c.paymentTerms} />
            <Row label="Discount Level" value={c.discountLevel != null ? `${c.discountLevel}%` : "None"} />
            <Row label="Priority Class" value={
              <div className="flex items-center gap-1.5">
                <PriorityBadge priority={c.priorityClass} />
                <span className="text-sm text-muted-foreground">Priority {c.priorityClass}</span>
              </div>
            } />
            <Row label="Customer Since" value={formatDate(c.createdAt)} />
          </CardContent>
        </Card>

        {c.notes && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{c.notes}</p>
            </CardContent>
          </Card>
        )}

        {c.addresses && c.addresses.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Addresses</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {c.addresses.map((addr: any) => (
                  <div key={addr.id} className="flex gap-3 p-3 rounded-lg border bg-muted/20">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold capitalize">{addr.addressType}</span>
                        {addr.label && <span className="text-xs text-muted-foreground">· {addr.label}</span>}
                        {addr.isDefault && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Default</span>}
                      </div>
                      <p className="text-sm">{addr.street}</p>
                      <p className="text-sm text-muted-foreground">{addr.postalCode} {addr.city}, {addr.country}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium w-32 shrink-0">{label}</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}
