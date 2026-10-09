"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { wajibAdmin } from "@/server/auth/kewenangan";
import { terapkanPemetaan, type HasilPemetaanProduk } from "@/server/keluarga-aroma/pemetaan";

/** Hasil konfirmasi pemetaan: hasil per produk (CODING_STANDARDS "Operasi massal mengembalikan hasil per item"). */
export type HasilKonfirmasiPemetaan =
  | { keadaan: "berhasil" | "tersimpanGagalMuatUlang"; hasil: HasilPemetaanProduk[] }
  | { keadaan: "gagal"; pesan: string };

const PATH_HALAMAN = "/admin/pemetaan-produk";

const PRODUK_TIDAK_DIKENAL = "Ada produk yang tidak dikenali. Muat ulang halaman, lalu pilih lagi.";
const TUJUAN_TIDAK_DIKENAL = "Pilih keluarga aroma, tanpa aroma, atau belum dipetakan.";

const skemaTujuan = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("terpetakan"),
      idKeluarga: z.number({ error: "Pilih keluarga aroma." }).int({ error: "Pilih keluarga aroma." }),
    }),
    z.object({ status: z.literal("tanpa-aroma") }),
    z.object({ status: z.literal("belum-dipetakan") }),
  ],
  { error: TUJUAN_TIDAK_DIKENAL },
);

const skemaKonfirmasi = z.object(
  {
    butir: z
      .array(
        z.object({
          kodeProduk: z.string({ error: PRODUK_TIDAK_DIKENAL }).min(1, PRODUK_TIDAK_DIKENAL),
          tujuan: skemaTujuan,
        }),
        { error: "Pilih minimal satu produk." },
      )
      .min(1, "Pilih minimal satu produk."),
  },
  { error: "Pilih minimal satu produk." },
);

/**
 * Konfirmasi pemetaan satu atau beberapa produk sekaligus (T45). Hanya admin, diperiksa di server sebelum membaca atau
 * menulis. Usulan dari kode tidak pernah diterapkan tanpa melewati aksi ini.
 */
export async function konfirmasiPemetaan(input: unknown): Promise<HasilKonfirmasiPemetaan> {
  const pengguna = await wajibAdmin();
  const isian = skemaKonfirmasi.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const hasil = await terapkanPemetaan(pengguna.id, isian.data.butir);
  try {
    revalidatePath(PATH_HALAMAN);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang", hasil };
  }
  return { keadaan: "berhasil", hasil };
}
