import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { tanggalWib } from "@/app/admin/impor/format";
import { AksesDitolakError, wajibGudangDenganHak, wajibMasuk } from "@/server/auth/kewenangan";
import type { GudangDapatDilihat } from "@/server/gudang/akses";
import { pilihanTokoPengiriman, riwayatPengirimanDiLuarJadwalGudang } from "@/server/gudang/pengiriman-di-luar-jadwal";
import { NAMA_GUDANG_PUSAT } from "@/server/gudang/seed-master";

// Halaman pengiriman di luar jadwal (T98; T113, PRD A5 ▶ Revisi 2026-10-13; DESIGN §6 ▶ 2026-10-13 sore): operator
// dengan hak `kelola-usulan-jadwal` mengusulkan pengiriman di luar jadwal di halaman sendiri. Pengguna yang berhak di
// lebih dari satu gudang memilih gudang dulu; yang berhak di satu gudang langsung masuk. Hak diperiksa di server
// sebelum membaca data. Jadwal tetap diatur admin (T112), bukan di sini.

export const HREF_HALAMAN_JADWAL = "/usulan-jadwal";

/** Jalur gudang: Pusat langsung berlaku, gudang lain menunggu persetujuan admin. */
type JalurPengiriman = "langsung" | "usulan";

/** Judul halaman per jalur (DESIGN §6 ▶ 2026-10-13 sore). */
const judulPengiriman: Record<JalurPengiriman, string> = {
  langsung: "Atur pengiriman di luar jadwal",
  usulan: "Usulkan pengiriman di luar jadwal",
};

/** Judul halaman daftar gudang. */
export const JUDUL_DAFTAR_GUDANG = judulPengiriman.usulan;

/** Id h1 halaman satu gudang; form di halaman itu memakainya sebagai nama (T103: form tidak mengulang h1). */
export const ID_JUDUL_HALAMAN_JADWAL = "judul-halaman-jadwal";

/** Judul h1 halaman satu gudang: "<judul> — <gudang>". */
export function judulHalamanJadwal(jalur: JalurPengiriman, namaGudang: string): string {
  return `${judulPengiriman[jalur]} — ${namaGudang}`;
}

const kelasTautanKembali =
  "inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Gudang tempat pengguna berhak `kelola-usulan-jadwal`. Tanpa hak di gudang mana pun → 404; hanya satu gudang →
 * langsung diarahkan ke halaman gudang itu.
 */
export async function muatDaftarGudangJadwal(): Promise<GudangDapatDilihat[]> {
  let daftarGudang;
  try {
    daftarGudang = await wajibGudangDenganHak("kelola-usulan-jadwal");
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  if (daftarGudang.length === 1) redirect(`${HREF_HALAMAN_JADWAL}/${daftarGudang[0].id}`);
  return daftarGudang;
}

/** Zona kerja (DESIGN §1): daftar gudang berupa kartu, gaya yang sama dengan daftar Pengiriman Gudang. */
export function DaftarGudangJadwal({ judul, daftarGudang }: { judul: string; daftarGudang: GudangDapatDilihat[] }) {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">{judul}</h1>
      <ul aria-label="Gudang" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {daftarGudang.map((g) => (
          <li key={g.id}>
            <Link
              href={`${HREF_HALAMAN_JADWAL}/${g.id}`}
              data-id-gudang={g.id}
              className="flex min-h-11 flex-col gap-2 rounded-3xl border border-border/60 bg-card p-6 shadow-soft transition-colors duration-300 ease-out outline-none hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex items-center justify-between gap-2 text-base font-semibold text-primary">
                {g.nama}
                <ChevronRight aria-hidden strokeWidth={2} className="size-5 shrink-0" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

/**
 * Gudang dan jalurnya (Pusat langsung, gudang lain usulan): tanpa hak `kelola-usulan-jadwal` di gudang itu, atau id
 * tidak dikenal → 404.
 */
async function muatJalurGudangJadwal(id: string): Promise<{ gudang: GudangDapatDilihat; jalur: JalurPengiriman }> {
  if (!/^\d{1,9}$/.test(id)) notFound();
  let daftarGudang;
  try {
    daftarGudang = await wajibGudangDenganHak("kelola-usulan-jadwal");
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const gudang = daftarGudang.find((g) => g.id === Number(id));
  if (!gudang) notFound();
  return { gudang, jalur: gudang.nama === NAMA_GUDANG_PUSAT ? "langsung" : "usulan" };
}

/** Judul tab halaman satu gudang (T103): sama dengan h1, diakhiri judul aplikasi. Hak diperiksa seperti halamannya. */
export async function metadataHalamanJadwal(id: string): Promise<Metadata> {
  const { gudang, jalur } = await muatJalurGudangJadwal(id);
  return { title: `${judulHalamanJadwal(jalur, gudang.nama)} — Dashboard Penjualan MANDALIKA` };
}

/**
 * Satu gudang untuk halaman pengiriman di luar jadwal: tanpa hak `kelola-usulan-jadwal` di gudang itu, atau id tidak
 * dikenal → 404. Mengembalikan jalur, pilihan toko form (toko dengan jadwal tetap aktif), riwayat gudang itu, pengguna,
 * dan tanggal hari ini (WIB).
 */
export async function muatGudangJadwal(id: string) {
  const { gudang, jalur } = await muatJalurGudangJadwal(id);
  const pengguna = await wajibMasuk();
  const hariIni = tanggalWib(new Date());
  const [pilihanToko, riwayat] = await Promise.all([
    pilihanTokoPengiriman(gudang.id, hariIni),
    riwayatPengirimanDiLuarJadwalGudang(gudang.id),
  ]);
  return { gudang, jalur, pilihanToko, riwayat, idPengguna: pengguna.id, hariIni };
}

/** Kerangka halaman satu gudang: tautan kembali ke daftar gudang, judul (`ID_JUDUL_HALAMAN_JADWAL`), lalu isi. */
export function KerangkaHalamanJadwal({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <Link href={HREF_HALAMAN_JADWAL} className={kelasTautanKembali}>
        <ArrowLeft aria-hidden strokeWidth={2} className="size-5" />
        Daftar gudang
      </Link>
      <h1 id={ID_JUDUL_HALAMAN_JADWAL} className="text-2xl font-bold md:text-3xl">
        {judul}
      </h1>
      {children}
    </main>
  );
}
