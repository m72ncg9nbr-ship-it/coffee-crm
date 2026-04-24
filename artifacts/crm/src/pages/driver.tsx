import { useListDeliveries, useUpdateDelivery } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { StatusBadge, UrgencyBadge } from "@/components/priority-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { MapPin, Truck, CheckCircle, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_TRANSITIONS: Record<string, { next: string; label: string; className: string }> = {
  assigned: { next: "in_transit", label: "Start Delivery", className: "bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500" },
  in_transit: { next: "arrived", label: "Mark Arrived", className: "bg-purple-600 hover:bg-purple-700 text-white border-purple-600" },
  arrived: { next: "awaiting_accounting_approval", label: "Complete Delivery", className: "bg-green-600 hover:bg-green-700 text-white border-green-600" },
};

export default function DriverPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: deliveries, isLoading, refetch } = useListDeliveries();

  const updateDelivery = useUpdateDelivery({
    mutation: {
      onSuccess: () => {
        refetch();
        toast({ title: "Status updated" });
      },
      onError: () => toast({ title: "Failed to update status", variant: "destructive" })
    }
  });

  const myDeliveries = (deliveries ?? []).filter((d: any) =>
    d.driverId === user?.id && !["approved", "rejected", "unassigned"].includes(d.status)
  );

  const today = new Date().toISOString().split("T")[0];
  const todayDeliveries = myDeliveries.filter((d: any) => d.scheduledDate?.startsWith(today));
  const upcomingDeliveries = myDeliveries.filter((d: any) => d.scheduledDate > today);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-4 shadow-md">
        <div className="flex items-center gap-3">
          <Truck className="h-6 w-6" />
          <div>
            <h1 className="font-bold text-lg">Driver View</h1>
            <p className="text-primary-foreground/80 text-sm">Hi, {user?.fullName}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5 max-w-lg mx-auto">
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground">Loading your deliveries...</div>
        )}

        {!isLoading && (
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
                    onAdvance={next => updateDelivery.mutate({ id: d.id, data: { status: next } })}
                    isPending={updateDelivery.isPending}
                  />
                ))}
              </div>
            </section>

            {upcomingDeliveries.length > 0 && (
              <section>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Upcoming</h2>
                <div className="space-y-3">
                  {upcomingDeliveries.map((d: any) => (
                    <DriverDeliveryCard key={d.id} delivery={d} upcoming />
                  ))}
                </div>
              </section>
            )}

            {myDeliveries.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Truck className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="font-medium">No deliveries assigned</p>
                <p className="text-sm mt-1">Check with operations for your schedule</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DriverDeliveryCard({ delivery: d, onAdvance, isPending, upcoming }: {
  delivery: any;
  onAdvance?: (next: string) => void;
  isPending?: boolean;
  upcoming?: boolean;
}) {
  const transition = STATUS_TRANSITIONS[d.status];

  return (
    <Card className={upcoming ? "opacity-70" : ""}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{d.customerName}</p>
            <p className="text-sm text-muted-foreground capitalize">{d.businessChannel}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <UrgencyBadge urgency={d.urgency} />
            <StatusBadge status={d.status} />
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          <p>📅 {formatDate(d.scheduledDate)}</p>
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

        {!upcoming && transition && (
          <Button
            className={`w-full font-semibold ${transition.className}`}
            onClick={() => onAdvance?.(transition.next)}
            disabled={isPending}
          >
            {transition.label}
          </Button>
        )}

        {d.status === "awaiting_accounting_approval" && (
          <div className="text-sm text-amber-700 bg-amber-50 rounded-md p-2.5 text-center font-medium">
            Awaiting accounting review
          </div>
        )}
      </CardContent>
    </Card>
  );
}
