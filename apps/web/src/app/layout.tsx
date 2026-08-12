import type { Metadata } from "next";
import { AppNavigation } from "@/components/app-navigation";
import { AuthProvider } from "@/components/auth-provider";
import { getAuthUser } from "@/lib/auth/auth-user";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

export const metadata: Metadata = { title: "Таксопарк: Автопарк и события", description: "Автопарк, события и уведомления таксопарка" };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { const user = await getAuthUser(); return <html lang="ru"><body><AuthProvider user={user}><AppNavigation />{children}</AuthProvider></body></html>; }
