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

/**
 * Jumlah kirim = max(0, ⌈(kebutuhan − stokAkhir) × (100 + persenBuffer) / 100⌉) (PRD A6, ADR-0008).
 * Stok dikurangkan tepat satu kali sebelum buffer diterapkan.
 */
export function hitungJumlahKirim(
  kebutuhan: number,
  stokAkhir: number,
  persenBuffer: number,
): number {
  pastikanTidakNegatif("kebutuhan", kebutuhan);
  pastikanBilanganBulat("stokAkhir", stokAkhir);
  pastikanTidakNegatif("persenBuffer", persenBuffer);

  const kekurangan = kebutuhan - stokAkhir;
  if (kekurangan <= 0) {
    return 0;
  }

  const kekuranganBerbuffer = kekurangan * (100 + persenBuffer);
  if (!Number.isSafeInteger(kekuranganBerbuffer)) {
    throw new RangeError(
      `(kebutuhan − stokAkhir) × (100 + persenBuffer) di luar rentang bilangan bulat aman: ${kekuranganBerbuffer}`,
    );
  }
  return bagiBulatAtas(kekuranganBerbuffer, 100);
}
