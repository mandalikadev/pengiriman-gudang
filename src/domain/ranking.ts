// Pembaca file ranking pusat (PRD A6, ▶ Keputusan OD-05). Murni: daftar sheet (nama + baris sel mentah)
// → baris ranking dan tujuh besar, atau daftar error. Setiap baris = satu kelompok ranking (keluarga aroma).
// Pencocokan ke keluarga lewat alias dan publikasi ada di luar modul ini (T53).

import { normalisasiAlias } from "./keluarga-aroma";

export type SelMentah = string | number | boolean | null;

type SheetMentah = {
  nama: string;
  /** Baris sel mulai baris 1 Excel dan kolom A; indeks 0 = baris 1. */
  baris: readonly (readonly SelMentah[])[];
};

type JenisErrorRanking =
  | "struktur-tidak-sesuai"
  | "rank-tidak-valid"
  | "rank-ganda"
  | "rank-loncat"
  | "variant-kosong"
  | "variant-ganda"
  | "qty-sales-tidak-valid"
  | "qty-sales-negatif";

export type ErrorRanking = {
  jenis: JenisErrorRanking;
  /** Nomor baris Excel (1 = header); `null` jika error tidak menunjuk satu baris. */
  baris: number | null;
  /** Penjelasan dalam bahasa Indonesia, termasuk cara memperbaikinya. */
  pesan: string;
};

type BarisRanking = { baris: number; rank: number; variant: string; qtySales: number };

type HasilBacaRanking =
  | { ok: true; baris: BarisRanking[]; tujuhBesar: string[] }
  | { ok: false; error: ErrorRanking[] };

const NAMA_SHEET = "RANKING SALES";
const HEADER = ["RANK", "VARIANT", "QTY SALES"] as const;
const JUMLAH_TUJUH_BESAR = 7;

function selKosong(sel: SelMentah | undefined): boolean {
  return sel === undefined || sel === null || (typeof sel === "string" && sel.trim() === "");
}

function tampilkanSel(sel: SelMentah | undefined): string {
  return selKosong(sel) ? "(kosong)" : `"${String(sel)}"`;
}

/** Bilangan bulat dari sel angka; teks berisi angka tidak diterima. */
function bilanganBulat(sel: SelMentah | undefined): number | null {
  return typeof sel === "number" && Number.isSafeInteger(sel) ? sel : null;
}

export function bacaRanking(daftarSheet: readonly SheetMentah[]): HasilBacaRanking {
  const sheet = daftarSheet.find((s) => s.nama === NAMA_SHEET);
  if (!sheet) {
    return gagal([
      {
        jenis: "struktur-tidak-sesuai",
        baris: null,
        pesan: `Sheet "${NAMA_SHEET}" tidak ditemukan. Ganti nama sheet ranking di file Excel menjadi "${NAMA_SHEET}", lalu unggah ulang.`,
      },
    ]);
  }

  const header = sheet.baris[0] ?? [];
  const headerSesuai =
    HEADER.every((judul, kolom) => header[kolom] === judul) &&
    header.slice(HEADER.length).every((sel) => selKosong(sel));
  if (!headerSesuai) {
    return gagal([
      {
        jenis: "struktur-tidak-sesuai",
        baris: 1,
        pesan: `Header baris 1 harus persis ${HEADER.join(", ")} di kolom A–C, tanpa kolom lain. Perbaiki header di file Excel, lalu unggah ulang.`,
      },
    ]);
  }

  const error: ErrorRanking[] = [];
  const hasil: BarisRanking[] = [];
  const barisPerRank = new Map<number, number>();
  const barisPerVariant = new Map<string, number>();

  for (let indeks = 1; indeks < sheet.baris.length; indeks++) {
    const sel = sheet.baris[indeks]!;
    if (sel.every((s) => selKosong(s))) continue;
    const nomor = indeks + 1;

    if (sel.slice(HEADER.length).some((s) => !selKosong(s))) {
      error.push({
        jenis: "struktur-tidak-sesuai",
        baris: nomor,
        pesan: `Baris ${nomor} berisi data di luar kolom A–C. Hapus isi kolom selain RANK, VARIANT, dan QTY SALES, lalu unggah ulang.`,
      });
      continue;
    }

    const [selRank, selVariant, selQty] = sel;
    let barisValid = true;

    const rank = bilanganBulat(selRank);
    if (rank === null || rank < 1) {
      barisValid = false;
      error.push({
        jenis: "rank-tidak-valid",
        baris: nomor,
        pesan: `RANK di baris ${nomor} berisi ${tampilkanSel(selRank)}. Isi dengan angka bilangan bulat mulai dari 1.`,
      });
    } else if (barisPerRank.has(rank)) {
      barisValid = false;
      error.push({
        jenis: "rank-ganda",
        baris: nomor,
        pesan: `RANK ${rank} di baris ${nomor} sudah dipakai di baris ${barisPerRank.get(rank)}. Setiap RANK harus unik; perbaiki salah satunya.`,
      });
    } else {
      barisPerRank.set(rank, nomor);
    }

    const variant = typeof selVariant === "string" || typeof selVariant === "number" ? String(selVariant).trim() : "";
    if (variant === "") {
      barisValid = false;
      error.push({
        jenis: "variant-kosong",
        baris: nomor,
        pesan: `VARIANT di baris ${nomor} kosong. Isi nama varian, atau hapus seluruh baris itu.`,
      });
    } else {
      const kunci = normalisasiAlias(variant);
      const barisSebelumnya = barisPerVariant.get(kunci);
      if (barisSebelumnya !== undefined) {
        barisValid = false;
        error.push({
          jenis: "variant-ganda",
          baris: nomor,
          pesan: `VARIANT "${variant}" di baris ${nomor} sama dengan baris ${barisSebelumnya}. Setiap VARIANT harus unik; gabungkan atau hapus salah satunya.`,
        });
      } else {
        barisPerVariant.set(kunci, nomor);
      }
    }

    const qtySales = bilanganBulat(selQty);
    if (qtySales === null) {
      barisValid = false;
      error.push({
        jenis: "qty-sales-tidak-valid",
        baris: nomor,
        pesan: `QTY SALES di baris ${nomor} berisi ${tampilkanSel(selQty)}. Isi dengan angka bilangan bulat 0 atau lebih.`,
      });
    } else if (qtySales < 0) {
      barisValid = false;
      error.push({
        jenis: "qty-sales-negatif",
        baris: nomor,
        pesan: `QTY SALES di baris ${nomor} negatif (${qtySales}). Isi dengan angka bilangan bulat 0 atau lebih.`,
      });
    }

    if (barisValid && rank !== null && qtySales !== null) {
      hasil.push({ baris: nomor, rank, variant, qtySales });
    }
  }

  // RANK harus berurutan mulai 1: setiap celah dilaporkan pada baris RANK pertama setelah celah.
  let berikutnya = 1;
  for (const rank of [...barisPerRank.keys()].sort((a, b) => a - b)) {
    if (rank > berikutnya) {
      const hilang = rank - 1 === berikutnya ? `RANK ${berikutnya}` : `RANK ${berikutnya}–${rank - 1}`;
      error.push({
        jenis: "rank-loncat",
        baris: barisPerRank.get(rank)!,
        pesan: `${hilang} tidak ada; RANK harus berurutan mulai dari 1. Perbaiki nomor RANK di file Excel, lalu unggah ulang.`,
      });
    }
    berikutnya = rank + 1;
  }

  if (error.length > 0) {
    return gagal(error.sort((a, b) => (a.baris ?? 0) - (b.baris ?? 0)));
  }

  const tujuhBesar = [...hasil]
    .filter((b) => b.rank <= JUMLAH_TUJUH_BESAR)
    .sort((a, b) => a.rank - b.rank)
    .map((b) => b.variant);
  return { ok: true, baris: hasil, tujuhBesar };
}

function gagal(error: ErrorRanking[]): HasilBacaRanking {
  return { ok: false, error };
}
