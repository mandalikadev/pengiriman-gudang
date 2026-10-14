import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { wajibMasuk } from "@/server/auth/kewenangan";

import { urlRiwayat, urlRiwayatDiLuarJadwal } from "./alamat";
import { isiTabDiLuarJadwal } from "./tab-di-luar-jadwal";
import { isiTabRencanaFinal } from "./tab-rencana-final";

export const metadata: Metadata = {
  title: "Riwayat — Dashboard Penjualan MANDALIKA",
};

// Tab halaman Riwayat (PRD A7 ▶ Keputusan 2026-10-14), dipilih lewat `?tab=`; nilai tidak dikenal berarti tab pertama.
// Tab "Di luar jadwal" ditambahkan di T128.
const daftarTab = [
  { nilai: "rencana-final", label: "Rencana final", url: urlRiwayat() },
  { nilai: "di-luar-jadwal", label: "Di luar jadwal", url: urlRiwayatDiLuarJadwal() },
] as const;
type Tab = (typeof daftarTab)[number];

function tabTerpilih(nilai: string | string[] | undefined): Tab {
  return daftarTab.find((t) => t.nilai === nilai) ?? daftarTab[0];
}

/** Tab berupa tautan (keadaan di URL); tab terpilih memakai gaya chip terpilih (DESIGN §11.8). */
function NavigasiTab({ terpilih }: { terpilih: Tab }) {
  return (
    <nav aria-label="Jenis riwayat">
      <ul className="flex flex-wrap gap-2">
        {daftarTab.map((t) => (
          <li key={t.nilai}>
            <Link
              href={t.url}
              data-tab-riwayat={t.nilai}
              aria-current={t.nilai === terpilih.nilai ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border border-input px-4 font-semibold transition-colors duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                t.nilai === terpilih.nilai ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:bg-primary/10 hover:text-primary",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Halaman Riwayat (T127; PRD A7 ▶ Keputusan 2026-10-14, DESIGN §6 ▶ Keputusan 2026-10-14): zona kerja (DESIGN §1) berisi
 * catatan pengiriman yang sudah terjadi untuk semua gudang: tab "Rencana final" dan "Di luar jadwal" (T128). Semua
 * pengguna yang sudah masuk (admin, operator, viewer) boleh membukanya, termasuk riwayat gudang nonaktif (OD-07); akses
 * ini tidak membuka halaman kerja gudang.
 */
export default async function HalamanRiwayat({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const pengguna = await wajibMasuk();
  const parameter = (await searchParams) ?? {};
  const tab = tabTerpilih(parameter.tab);
  const isi =
    tab.nilai === "di-luar-jadwal"
      ? await isiTabDiLuarJadwal({ parameter, urlHalaman: urlRiwayat(), tab: tab.nilai })
      : await isiTabRencanaFinal({ pengguna, parameter, urlHalaman: urlRiwayat() });

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Riwayat</h1>
      <NavigasiTab terpilih={tab} />
      {isi}
    </main>
  );
}
