import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";

interface User {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: "admin" | "operations" | "sales" | "driver" | "accounting";
  active: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType>({ user: null, isLoading: true, refetch: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useGetCurrentUser({
    query: { retry: false, refetchOnWindowFocus: false } as any,
  });

  return (
    <AuthContext.Provider value={{ user: (data as User | undefined) ?? null, isLoading, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
