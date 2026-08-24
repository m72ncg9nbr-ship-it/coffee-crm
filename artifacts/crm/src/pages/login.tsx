import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useLogin, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SHOW_LANDING } from "@/lib/theme";
import LandingPage from "@/pages/landing";

const ROLE_DEFAULT: Record<string, string> = {
  owner_admin:     "/dashboard",
  general_manager: "/dashboard",
  channel_manager: "/dashboard",
  sales:           "/dashboard",
  driver:          "/driver",
  accounting:      "/accounting",
};

export default function LoginPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { lang, setLang } = useLang();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      navigate(ROLE_DEFAULT[user.role] ?? "/dashboard");
    }
  }, [user, navigate]);

  const login = useLogin({
    mutation: {
      onSuccess: (data: unknown) => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), (data as any)?.user ?? data);
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      },
      onError: () => {
        setError(t("invalidCredentials", lang));
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    login.mutate({ data: { username, password } });
  };

  // The login card (no branding header — used inside LandingPage's right panel
  // and in the classic full-screen view with its own branding block below)
  const loginFormCard = (
    <Card className="shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{t("signIn", lang)}</CardTitle>
        <CardDescription>{t("enterCredentials", lang)}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t("username", lang)}</Label>
            <Input
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. admin"
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password", lang)}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? t("signingIn", lang) : t("signInBtn", lang)}
          </Button>
        </form>
        <div className="mt-5 pt-4 border-t">
          <p className="text-xs text-muted-foreground font-medium mb-2">{t("demoAccounts", lang)}</p>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            {[
              { u: "admin",   p: "admin123",  label: "Owner Admin" },
              { u: "gm1",     p: "gm123",     label: "General Manager" },
              { u: "ops1",    p: "ops123",     label: "Channel Manager" },
              { u: "sales1",  p: "sales123",   label: "Sales" },
              { u: "driver1", p: "driver123",  label: "Driver" },
              { u: "acct1",   p: "acct123",    label: "Accounting" },
            ].map(acc => (
              <button
                key={acc.u}
                type="button"
                onClick={() => { setUsername(acc.u); setPassword(acc.p); setError(""); }}
                className="text-left px-2 py-1 rounded hover-elevate active-elevate-2 border border-transparent hover:border-border text-muted-foreground transition-colors"
                data-testid={`button-demo-${acc.u}`}
              >
                <span className="font-mono">{acc.u}</span>
                <span className="text-[10px] block opacity-70">{acc.label}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (SHOW_LANDING) {
    return (
      <LandingPage lang={lang} setLang={setLang}>
        {loginFormCard}
      </LandingPage>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 to-amber-50 flex items-center justify-center p-4">
      {/* Language toggle */}
      <div className="absolute top-4 right-4 flex items-center gap-1 bg-white/80 rounded-lg border px-2 py-1 shadow-sm">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <button
          type="button"
          onClick={() => setLang("en")}
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${lang === "en" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLang("tr")}
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${lang === "tr" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
        >
          TR
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-md">
            <Globe className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("appName", lang)}</h1>
            <p className="text-sm text-muted-foreground">{t("appSubtitle", lang)}</p>
          </div>
        </div>
        {loginFormCard}
      </div>
    </div>
  );
}
