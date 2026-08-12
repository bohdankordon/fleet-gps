"use client";
import { createContext, useContext } from "react";
import type { AuthUser } from "@/lib/auth/auth-contract";
const AuthContext = createContext<AuthUser | null>(null);
export function AuthProvider({ user, children }: Readonly<{ user: AuthUser | null; children: React.ReactNode }>) { return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>; }
export function useAuth(): AuthUser | null { return useContext(AuthContext); }
