import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useLogin, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const ROLE_DEFAULT: Record<string, string> = {
  admin: "/dashboard",
  operations: "/dashboard",
  sales: "/dashboard",
  driver: "/driver",
  accounting: "/accounting",
};

export default function LoginPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
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
      onSuccess: (data) => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), (data as any)?.user ?? data);
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      },
      onError: () => {
        setError("Invalid username or password");
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    login.mutate({ data: { username, password } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-md">
            <Coffee className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Coffee CRM</h1>
            <p className="text-sm text-muted-foreground">Distribution Operations</p>
          </div>
        </div>
        <Card className="shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sign in to your account</CardTitle>
            <CardDescription>Enter your credentials to access the system</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. admin"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
                {login.isPending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
            <div className="mt-5 pt-4 border-t">
              <p className="text-xs text-muted-foreground font-medium mb-2">Demo accounts:</p>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <span>admin / admin123</span>
                <span>ops1 / ops123</span>
                <span>sales1 / sales123</span>
                <span>driver1 / driver123</span>
                <span>acct1 / acct123</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
