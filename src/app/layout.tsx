import type { Metadata } from "next";
import { Fraunces, Nunito } from "next/font/google";
import type { ReactNode } from "react";

import { Navigasi } from "@/components/navigasi";
import { penggunaSaatIni } from "@/server/auth/kewenangan";
import { daftarGudangDapatDilihat } from "@/server/gudang/akses";

import "./globals.css";

// DESIGN §3: Fraunces untuk judul, Nunito untuk teks lain. next/font meng-host sendiri saat build.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dashboard Penjualan MANDALIKA",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pengguna = await penggunaSaatIni();
  const aksesPengirimanGudang = pengguna !== null && (await daftarGudangDapatDilihat(pengguna)).length > 0;
  return (
    <html lang="id" className={`${fraunces.variable} ${nunito.variable}`}>
      <body className="min-h-screen pt-4 antialiased">
        <Navigasi
          tampilkanAdmin={pengguna?.peran === "admin"}
          tampilkanPengirimanGudang={aksesPengirimanGudang}
          sudahMasuk={pengguna !== null}
        />
        {children}
        <div aria-hidden className="tekstur-kertas" />
      </body>
    </html>
  );
}
