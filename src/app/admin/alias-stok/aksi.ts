"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { HasilSimpan } from "@/components/keadaan-simpan";
import * as aliasStok from "@/server/alias-stok/alias-stok";
import { bacaTabelAlias } from "@/server/alias-stok/baca-tabel-alias";
import { wajibAdmin } from "@/server/auth/kewenangan";

// T82: admin mengelola alias nama stok. Peran diperiksa di server sebelum data dibaca atau ditulis.

const PATH_HALAMAN = "/admin/alias-stok";

/** Batas file tabel alias yang dibaca di server action, tanpa storage S3 (issue T82). */
const BATAS_UKURAN_FILE = 1_048_576;

export type HasilBarisUnggah = aliasStok.HasilTambahAlias & { nomor: number };
export type JumlahUnggah = Record<aliasStok.HasilTambahAlias["keadaan"], number>;
export type HasilUnggahAlias =
  | { keadaan: "berhasil" | "tersimpanGagalMuatUlang"; baris: HasilBarisUnggah[]; jumlah: JumlahUnggah }
  | { keadaan: "gagal"; pesan: string };

const skemaTambah = z.object({
  alias: z.string({ error: "Alias wajib diisi." }),
  kodeProduk: z.string({ error: "Kode produk wajib diisi." }),
});
const skemaHapus = z.object({ alias: z.string({ error: "Alias tidak ditemukan." }) });

function gagal(pesan: string): HasilSimpan {
  return { keadaan: "gagal", pesan };
}

function muatUlang(): "berhasil" | "tersimpanGagalMuatUlang" {
  try {
    revalidatePath(PATH_HALAMAN);
  } catch {
    return "tersimpanGagalMuatUlang";
  }
  return "berhasil";
}

export async function tambahAliasStok(input: unknown): Promise<HasilSimpan> {
  const pengguna = await wajibAdmin();
  const isian = skemaTambah.safeParse(input);
  if (!isian.success) return gagal(isian.error.issues[0].message);
  const hasil = await aliasStok.tambahAliasStok(isian.data, pengguna.id);
  if (hasil.keadaan === "ditolak") return gagal(hasil.alasan);
  if (hasil.keadaan === "sudahAda") {
    return gagal(`Alias ${hasil.alias} sudah ada untuk kode ${hasil.kodeProduk}; tidak diubah.`);
  }
  return { keadaan: muatUlang() };
}

export async function hapusAliasStok(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = skemaHapus.safeParse(input);
  if (!isian.success) return gagal(isian.error.issues[0].message);
  if (!(await aliasStok.hapusAliasStok(isian.data.alias))) return gagal("Alias tidak ditemukan.");
  return { keadaan: muatUlang() };
}

/** Unggah tabel alias (CSV `;` atau `.xlsx`) dari FormData field `file`; hasil per baris. */
export async function unggahTabelAlias(form: FormData): Promise<HasilUnggahAlias> {
  const pengguna = await wajibAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.name === "") return { keadaan: "gagal", pesan: "Pilih file tabel alias." };
  if (file.size > BATAS_UKURAN_FILE) return { keadaan: "gagal", pesan: "File melebihi 1 MB." };

  const tabel = bacaTabelAlias(file.name, new Uint8Array(await file.arrayBuffer()));
  if (!tabel.ok) return { keadaan: "gagal", pesan: tabel.pesan };

  const baris = await aliasStok.tambahAliasDariTabel(tabel.baris, pengguna.id);
  const jumlah: JumlahUnggah = { ditambahkan: 0, sudahAda: 0, ditolak: 0 };
  for (const b of baris) jumlah[b.keadaan]++;
  return { keadaan: jumlah.ditambahkan > 0 ? muatUlang() : "berhasil", baris, jumlah };
}
