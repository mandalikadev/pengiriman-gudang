// T81 — pilihan buka/tutup kelompok sidebar, diingat di browser itu (DESIGN §6 ▶ Keputusan 2026-10-11, UAT).
// Bila localStorage tidak tersedia (mode privat, diblokir), pilihan hanya bertahan di memori tab; tidak ada error.

// T95: kunci baru untuk susunan kelompok urutan kerja; pilihan dari susunan lama (Operasional/Admin) tidak dibawa.
const KUNCI = "mandalika:sidebar-kelompok-v2";

let memori: string | null = null;
const pendengar = new Set<() => void>();

/** Untuk `useSyncExternalStore`: perubahan dari sidebar ini dan dari tab lain (`storage`). */
export function langgananPilihanKelompok(dipanggil: () => void) {
  pendengar.add(dipanggil);
  window.addEventListener("storage", dipanggil);
  return () => {
    pendengar.delete(dipanggil);
    window.removeEventListener("storage", dipanggil);
  };
}

/** Pilihan tersimpan (JSON mentah, agar snapshot stabil), atau `null`. */
export function bacaPilihanKelompok(): string | null {
  try {
    return window.localStorage.getItem(KUNCI);
  } catch {
    return memori;
  }
}

/** JSON tersimpan → pilihan per judul kelompok (`true` = terbuka). Isi rusak diabaikan. */
export function uraiPilihanKelompok(teks: string | null): Record<string, boolean> {
  if (teks === null) return {};
  try {
    const isi: unknown = JSON.parse(teks);
    if (typeof isi !== "object" || isi === null || Array.isArray(isi)) return {};
    return Object.fromEntries(Object.entries(isi).filter((e): e is [string, boolean] => typeof e[1] === "boolean"));
  } catch {
    return {};
  }
}

/** Menyimpan pilihan buka/tutup satu kelompok. */
export function tulisPilihanKelompok(judul: string, terbuka: boolean) {
  const teks = JSON.stringify({ ...uraiPilihanKelompok(bacaPilihanKelompok()), [judul]: terbuka });
  try {
    window.localStorage.setItem(KUNCI, teks);
  } catch {
    memori = teks;
  }
  for (const dipanggil of pendengar) dipanggil();
}
