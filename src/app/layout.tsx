import type { Metadata } from "next";
import { Fraunces, Nunito } from "next/font/google";
import type { ComponentProps, ReactNode } from "react";

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
  const daftarGudang = pengguna === null ? [] : await daftarGudangDapatDilihat(pengguna);
  // Akses lihat Pengiriman Gudang: admin, atau punya penugasan di suatu gudang (PRD A3).
  const aksesPengirimanGudang = daftarGudang.length > 0;
  // Halaman jadwal toko (T98): hak kelola-usulan-jadwal di sedikitnya satu gudang, dari penugasan yang sama.
  const aksesJadwalToko = daftarGudang.some((g) => g.hakTindakan.includes("kelola-usulan-jadwal"));
  // Peran yang ditampilkan di sidebar (CONTEXT.md): operator = bukan admin, tetapi ditugaskan ke gudang.
  const penggunaSidebar: ComponentProps<typeof Navigasi>["pengguna"] =
    pengguna === null
      ? null
      : { nama: pengguna.nama, peran: pengguna.peran === "admin" ? "admin" : aksesPengirimanGudang ? "operator" : "viewer" };
  return (
    <html lang="id" className={`${fraunces.variable} ${nunito.variable}`}>
      <body className="min-h-screen antialiased">
        <Navigasi
          pengguna={penggunaSidebar}
          tampilkanPengirimanGudang={aksesPengirimanGudang}
          tampilkanJadwalToko={aksesJadwalToko}
        >
          {children}
        </Navigasi>
        <div aria-hidden className="tekstur-kertas" />
      </body>
    </html>
  );
}
