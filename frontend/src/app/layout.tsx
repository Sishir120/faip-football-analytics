import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import NavSidebar from "@/components/NavSidebar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FAIP | Football Analytics Intelligence Platform",
  description: "Advanced match intelligence, xG modelling, player comparisons, and visual scouting dashboards.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} dark h-full antialiased`}
    >
      <body className="font-sans min-h-full flex bg-[#0e1117] text-slate-100">
        <NavSidebar />
        <main className="flex-1 h-screen overflow-y-auto flex flex-col pt-14 md:pt-0">
          {children}
        </main>
      </body>
    </html>
  );
}
