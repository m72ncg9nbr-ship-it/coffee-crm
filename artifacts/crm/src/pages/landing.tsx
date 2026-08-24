import {
  Globe,
  Coffee,
  Sparkles,
  TrendingUp,
  AlertCircle,
  ShoppingCart,
  Zap,
  CheckCircle,
} from "lucide-react";
import { t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LandingPageProps {
  children: React.ReactNode;
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export default function LandingPage({ children, lang, setLang }: LandingPageProps) {
  const navItems = [
    t("solutions", lang),
    t("channels", lang),
    t("reports", lang),
    t("actionCenter", lang),
  ];

  type StatCard = {
    icon: React.ElementType;
    label: string;
    value: string;
    sub: string;
    iconColor: string;
    iconBg: string;
  };

  const statCards: StatCard[] = [
    {
      icon: TrendingUp,
      label: t("landingRevGrowth", lang),
      value: "+18.4%",
      sub: t("landingTrending", lang),
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
    },
    {
      icon: AlertCircle,
      label: t("landingOverduePayments", lang),
      value: "₺24,800",
      sub: "3 " + t("customers", lang).toLowerCase(),
      iconColor: "text-rose-600",
      iconBg: "bg-rose-50",
    },
    {
      icon: ShoppingCart,
      label: t("landingPendingApprovals", lang),
      value: "7",
      sub: t("orders", lang).toLowerCase(),
      iconColor: "text-amber-600",
      iconBg: "bg-amber-50",
    },
    {
      icon: Zap,
      label: t("landingActionItems", lang),
      value: "5",
      sub: t("openItems", lang),
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
    },
    {
      icon: Coffee,
      label: t("coffee", lang),
      value: "↑ 23%",
      sub: t("landingRevGrowth", lang),
      iconColor: "text-orange-700",
      iconBg: "bg-orange-50",
    },
    {
      icon: Sparkles,
      label: t("cosmetics", lang),
      value: "↑ 31%",
      sub: t("landingRevGrowth", lang),
      iconColor: "text-pink-600",
      iconBg: "bg-pink-50",
    },
  ];

  const featurePills = [
    t("customers", lang),
    t("orders", lang),
    t("deliveries", lang),
    t("inventory", lang),
    t("reports", lang),
    t("actionCenter", lang),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top Navigation ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 h-14 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="h-full max-w-screen-xl mx-auto px-6 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-6 shrink-0">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Globe className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm text-foreground">NS Global</span>
            <span className="hidden sm:inline text-sm text-muted-foreground">Operations Hub</span>
          </div>

          {/* Nav items (visual only — no routing) */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1" aria-label="site navigation">
            {navItems.map(item => (
              <span
                key={item}
                className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-muted/60 transition-colors cursor-default select-none"
              >
                {item}
              </span>
            ))}
          </nav>

          {/* Language toggle */}
          <div className="ml-auto flex items-center gap-1 bg-muted rounded-md px-1.5 py-1">
            <Globe className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
            {(["en", "tr"] as const).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={cn(
                  "text-xs px-2 py-0.5 rounded transition-colors font-medium uppercase",
                  lang === l
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col lg:flex-row">
        {/* Left: Hero content */}
        <div className="flex-1 relative flex flex-col justify-center px-8 md:px-14 py-14 lg:py-0 overflow-hidden">
          {/* Background decorations */}
          <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
            <div className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full bg-primary/[0.05]" />
            <div className="absolute -bottom-32 -right-16 w-[500px] h-[500px] rounded-full bg-primary/[0.04]" />
          </div>

          <div className="relative z-10 max-w-2xl">
            {/* Channel badge */}
            <div className="inline-flex items-center gap-1.5 bg-primary/[0.08] border border-primary/[0.15] text-primary text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
              <Coffee className="h-3.5 w-3.5 shrink-0" />
              {t("landingBadge", lang)}
            </div>

            {/* Headline */}
            <h1 className="text-3xl md:text-4xl xl:text-[2.6rem] font-bold text-foreground leading-tight mb-5">
              {t("landingHeadline", lang)}
            </h1>

            {/* Subtitle */}
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg">
              {t("landingSubtitle", lang)}
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mb-10">
              {featurePills.map(pill => (
                <span
                  key={pill}
                  className="inline-flex items-center gap-1.5 text-xs font-medium bg-card border border-border rounded-full px-3 py-1 text-muted-foreground shadow-sm"
                >
                  <CheckCircle className="h-3 w-3 text-primary shrink-0" />
                  {pill}
                </span>
              ))}
            </div>

            {/* Floating stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {statCards.map((card, idx) => {
                const Icon = card.icon;
                return (
                  <div
                    key={idx}
                    className="bg-card border border-card-border rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={cn(
                          "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                          card.iconBg,
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5", card.iconColor)} />
                      </div>
                      <span className="text-[11px] font-medium text-muted-foreground leading-tight line-clamp-1">
                        {card.label}
                      </span>
                    </div>
                    <div className="text-xl font-bold text-foreground">{card.value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Login form */}
        <div className="w-full lg:w-[460px] xl:w-[500px] shrink-0 flex items-center justify-center p-8 lg:border-l border-border bg-card/50">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
