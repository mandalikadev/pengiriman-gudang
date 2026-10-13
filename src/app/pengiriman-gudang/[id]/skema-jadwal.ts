import { z } from "zod";

import { daftarHariKirim, daftarPersiapan, daftarPolaJadwal } from "@/server/gudang/pilihan-jadwal";

// Skema isian jadwal satu toko (T55) yang dipakai server action operator (`aksi.ts`) dan admin (`/admin/jadwal-toko`,
// T112). Aturan jadwal sendiri divalidasi domain (`periksaJadwal`, T54).

export const skemaToko = z.object({
  idGudang: z.number().int(),
  idToko: z.number({ error: "Pilih toko." }).int({ error: "Pilih toko." }),
});

export const isianJadwal = {
  pola: z.enum(daftarPolaJadwal, { error: "Pilih pola jadwal." }),
  hariKirim: z.array(
    z.object({
      hari: z.enum(daftarHariKirim, { error: "Hari kirim tidak dikenal." }),
      persiapan: z.enum(daftarPersiapan, { error: "Pilih persiapan H, H−1, atau H−2." }),
    }),
    { error: "Pilih hari kirim." },
  ),
  tanggalJangkar: z.string({ error: "Tanggal jangkar tidak valid." }).nullable(),
};

export const skemaJadwal = skemaToko.extend(isianJadwal);
