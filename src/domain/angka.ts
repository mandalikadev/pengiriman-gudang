// Modul angka (ADR-0008): satu-satunya tempat pembulatan ke atas dan penerapan buffer.
// Semua hitungan memakai bilangan bulat supaya tidak terkena galat float
// (mis. 10 × 1.1 = 11.000000000000002 → Math.ceil = 12, padahal benar 11).

function pastikanBilanganBulat(nama: string, nilai: number): void {
  if (!Number.isSafeInteger(nilai)) {
    throw new RangeError(`${nama} harus bilangan bulat (aman), diterima: ${nilai}`);
  }
}

function pastikanTidakNegatif(nama: string, nilai: number): void {
  pastikanBilanganBulat(nama, nilai);
  if (nilai < 0) {
    throw new RangeError(`${nama} tidak boleh negatif, diterima: ${nilai}`);
  }
}

/** ⌈jumlah / pembagi⌉ untuk jumlah ≥ 0 dan pembagi > 0, keduanya bilangan bulat. */
export function bagiBulatAtas(jumlah: number, pembagi: number): number {
  pastikanTidakNegatif("jumlah", jumlah);
  pastikanBilanganBulat("pembagi", pembagi);
  if (pembagi <= 0) {
    throw new RangeError(`pembagi harus lebih besar dari 0, diterima: ${pembagi}`);
  }

  const sisa = jumlah % pembagi;
  // (jumlah − sisa) kelipatan tepat dari pembagi, jadi pembagian ini eksak.
  const hasilBagi = (jumlah - sisa) / pembagi;
  return sisa === 0 ? hasilBagi : hasilBagi + 1;
}

/** ⌊jumlah / pembagi⌋ untuk jumlah ≥ 0 dan pembagi > 0, keduanya bilangan bulat. */
export function bagiBulatBawah(jumlah: number, pembagi: number): number {
  pastikanTidakNegatif("jumlah", jumlah);
  pastikanBilanganBulat("pembagi", pembagi);
  if (pembagi <= 0) {
    throw new RangeError(`pembagi harus lebih besar dari 0, diterima: ${pembagi}`);
  }

  // (jumlah − sisa) kelipatan tepat dari pembagi, jadi pembagian ini eksak.
  return (jumlah - (jumlah % pembagi)) / pembagi;
}

/**
 * Rumus jumlah kirim (PRD A6 ▶ Revisi 2026-10-14): `stok-target` = rumus yang berlaku, dipakai `hitungJumlahKirim`;
 * `lama` = ⌈(kebutuhan − stokAkhir) × (1 + buffer)⌉, hanya untuk menampilkan rencana final yang difinalisasi dengannya.
 */
export const daftarRumusJumlahKirim = ["stok-target", "lama"] as const;
export type RumusJumlahKirim = (typeof daftarRumusJumlahKirim)[number];

/** Rumus yang dipakai `hitungJumlahKirim`; disimpan di rencana final saat finalisasi. */
export const RUMUS_JUMLAH_KIRIM_BERLAKU = "stok-target" satisfies RumusJumlahKirim;

/** `a × b` untuk bilangan bulat; ditolak bila hasilnya di luar rentang bilangan bulat aman. */
function kaliAman(nama: string, a: number, b: number): number {
  const hasil = a * b;
  if (!Number.isSafeInteger(hasil)) {
    throw new RangeError(`${nama} di luar rentang bilangan bulat aman: ${hasil}`);
  }
  return hasil;
}

/** Masukan jumlah kirim: kebutuhan ≥ 0, stok akhir bilangan bulat (boleh negatif), buffer persen bulat ≥ 0. */
function pastikanMasukanJumlahKirim(kebutuhan: number, stokAkhir: number, persenBuffer: number): void {
  pastikanTidakNegatif("kebutuhan", kebutuhan);
  pastikanBilanganBulat("stokAkhir", stokAkhir);
  pastikanTidakNegatif("persenBuffer", persenBuffer);
}

/** Stok target = ⌈kebutuhan × (100 + persenBuffer) / 100⌉ (CONTEXT "Stok target", ADR-0008). */
function hitungStokTarget(kebutuhan: number, persenBuffer: number): number {
  return bagiBulatAtas(kaliAman("kebutuhan × (100 + persenBuffer)", kebutuhan, 100 + persenBuffer), 100);
}

/**
 * Jumlah kirim = max(0, stok target − stokAkhir) = max(0, ⌈kebutuhan × (100 + persenBuffer) / 100⌉ − stokAkhir)
 * (PRD A6 ▶ Revisi 2026-10-14, ADR-0008). Buffer dikenakan pada seluruh kebutuhan; stok akhir dikurangkan satu kali,
 * setelah buffer.
 */
export function hitungJumlahKirim(
  kebutuhan: number,
  stokAkhir: number,
  persenBuffer: number,
): number {
  pastikanMasukanJumlahKirim(kebutuhan, stokAkhir, persenBuffer);
  const kekurangan = hitungStokTarget(kebutuhan, persenBuffer) - stokAkhir;
  return kekurangan > 0 ? kekurangan : 0;
}

/** Rumus lama: max(0, ⌈(kebutuhan − stokAkhir) × (100 + persenBuffer) / 100⌉). Hanya untuk rencana final lama. */
function hitungJumlahKirimRumusLama(kebutuhan: number, stokAkhir: number, persenBuffer: number): number {
  pastikanMasukanJumlahKirim(kebutuhan, stokAkhir, persenBuffer);
  const kekurangan = kebutuhan - stokAkhir;
  if (kekurangan <= 0) {
    return 0;
  }
  return bagiBulatAtas(kaliAman("(kebutuhan − stokAkhir) × (100 + persenBuffer)", kekurangan, 100 + persenBuffer), 100);
}

/**
 * Asal jumlah kirim untuk ditampilkan (DESIGN §8) menurut `rumus`. `hasilPerseratus` = hasil sebelum pembulatan dalam
 * perseratus (bilangan bulat; negatif bila stok melebihi): untuk `stok-target` kebutuhan × (100 + persenBuffer) −
 * stokAkhir × 100, mis. `56 × 120% − 20 = 47,2 → dibulatkan ke atas 48`; untuk `lama` (kebutuhan − stokAkhir) ×
 * (100 + persenBuffer), mis. `(56 − 20) × 120% = 43,2 → dibulatkan ke atas 44`.
 */
export function rincianJumlahKirim(kebutuhan: number, stokAkhir: number, persenBuffer: number, rumus: RumusJumlahKirim) {
  const persenPengali = 100 + persenBuffer;
  if (rumus === "lama") {
    const jumlahKirim = hitungJumlahKirimRumusLama(kebutuhan, stokAkhir, persenBuffer);
    const hasilPerseratus = kaliAman("(kebutuhan − stokAkhir) × (100 + persenBuffer)", kebutuhan - stokAkhir, persenPengali);
    return { rumus, kebutuhan, stokAkhir, persenPengali, hasilPerseratus, jumlahKirim };
  }
  const jumlahKirim = hitungJumlahKirim(kebutuhan, stokAkhir, persenBuffer);
  const stokTarget = hitungStokTarget(kebutuhan, persenBuffer);
  const hasilPerseratus = kebutuhan * persenPengali - kaliAman("stokAkhir × 100", stokAkhir, 100);
  if (!Number.isSafeInteger(hasilPerseratus)) {
    throw new RangeError(`kebutuhan × (100 + persenBuffer) − stokAkhir × 100 di luar rentang bilangan bulat aman: ${hasilPerseratus}`);
  }
  return { rumus, kebutuhan, stokAkhir, persenPengali, stokTarget, hasilPerseratus, jumlahKirim };
}
