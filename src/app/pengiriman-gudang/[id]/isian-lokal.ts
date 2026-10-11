"use client";

// Penyimpanan lokal isian stok yang belum disimpan (T59, PRD A7): bertahan setelah muat ulang dan gangguan akses, sampai
// berhasil disimpan. Bila localStorage tidak tersedia (mode privat, kuota penuh), isian hanya bertahan di memori tab.

const memori = new Map<string, string>();
const pendengar = new Set<() => void>();

/** Kunci isian lokal per gudang, tanggal kirim, dan toko. */
export function kunciIsianLokal(idGudang: number, tanggalKirim: string, tokoId: number) {
  return `mandalika:stok-draft:${idGudang}:${tanggalKirim}:${tokoId}`;
}

/** Untuk `useSyncExternalStore`: perubahan dari form ini dan dari tab lain (`storage`). */
export function langgananIsianLokal(dipanggil: () => void) {
  pendengar.add(dipanggil);
  window.addEventListener("storage", dipanggil);
  return () => {
    pendengar.delete(dipanggil);
    window.removeEventListener("storage", dipanggil);
  };
}

/** Isian lokal (JSON) untuk `kunci`, atau `null`. */
export function bacaIsianLokal(kunci: string): string | null {
  try {
    const teks = window.localStorage.getItem(kunci);
    if (teks !== null) return teks;
  } catch {
    // Tidak tersedia: pakai memori.
  }
  return memori.get(kunci) ?? null;
}

/** Menulis isian lokal untuk `kunci`; `null` menghapusnya. */
export function tulisIsianLokal(kunci: string, isian: Readonly<Record<string, string>> | null) {
  memori.delete(kunci);
  try {
    if (isian === null) window.localStorage.removeItem(kunci);
    else window.localStorage.setItem(kunci, JSON.stringify(isian));
  } catch {
    if (isian !== null) memori.set(kunci, JSON.stringify(isian));
  }
  for (const dipanggil of pendengar) dipanggil();
}

/** Stok akhir tersimpan → teks isian: kosong = belum diketahui. */
export const teksStok = (stokAkhir: number | null) => (stokAkhir === null ? "" : String(stokAkhir));

/** Isian lokal (JSON) → isian per kode produk, hanya untuk varian yang ada di draft. */
export function uraiIsianLokal(teks: string | null, kodeDraft: ReadonlySet<string>): Record<string, string> {
  if (teks === null) return {};
  try {
    const isi: unknown = JSON.parse(teks);
    if (typeof isi !== "object" || isi === null || Array.isArray(isi)) return {};
    return Object.fromEntries(
      Object.entries(isi).filter((e): e is [string, string] => kodeDraft.has(e[0]) && typeof e[1] === "string"),
    );
  } catch {
    return {};
  }
}
