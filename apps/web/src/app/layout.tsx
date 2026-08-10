import type { Metadata } from "next";
import { AppNavigation } from "@/components/app-navigation";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

export const metadata: Metadata = { title: "Таксопарк: Автопарк и события", description: "Автопарк, события и уведомления таксопарка" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ru"><body><AppNavigation />{children}</body></html>; }
