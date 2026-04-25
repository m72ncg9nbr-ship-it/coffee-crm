import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetCurrentUser, useLogin, useLogout } from "@workspace/api-client-react";
import type { User, LoginBody } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (data: LoginBody) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading: isQueryLoading, refetch } = useGetCurrentUser({
    query: {
      retry: false,
    } as any,
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isQueryLoading) {
      setIsLoading(false);
    }
  }, [isQueryLoading]);

  const login = async (data: LoginBody) => {
    await loginMutation.mutateAsync({ data });
    await refetch();
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
    await refetch();
  };

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
