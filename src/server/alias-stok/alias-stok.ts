import { asc, eq } from "drizzle-orm";

import { cocokkanNamaStok, normalisasiNamaStok, type AliasNamaStok, type ProdukMaster } from "@/domain/alias-stok";
import { db } from "@/server/db";
import { aliasNamaStok, produk } from "@/server/db/schema";

// Alias nama stok (T82, PRD A6 ▶ Keputusan 2026-10-12 UAT; CONTEXT "Alias nama stok"). Aturan tambah berlaku sama
// untuk form satu alias dan setiap baris unggahan: kode produk harus ada di master; alias yang sudah ada untuk kode
// yang sama = "sudah ada" (tidak diubah); alias milik produk lain atau sama dengan nama master produk lain ditolak;
// alias kosong ditolak. Operasi massal mengembalikan hasil per baris (CODING_STANDARDS).

export type HasilTambahAlias =
  | { keadaan: "ditambahkan"; alias: string; kodeProduk: string }
  | { keadaan: "sudahAda"; alias: string; kodeProduk: string }
  | { keadaan: "ditolak"; alias: string; kodeProduk: string; alasan: string };

export type BarisAliasStok = { alias: string; kodeProduk: string; namaProduk: string };

/** Master produk dan alias tersimpan, dimuat sekali untuk satu rangkaian penambahan. */
type Konteks = { produk: Map<string, ProdukMaster>; alias: AliasNamaStok[] };

async function muatKonteks(): Promise<Konteks> {
  const master = await db.select({ kode: produk.kode, nama: produk.nama }).from(produk);
  const alias = await db.select({ alias: aliasNamaStok.alias, kodeProduk: aliasNamaStok.kodeProduk }).from(aliasNamaStok);
  return { produk: new Map(master.map((p) => [p.kode.toUpperCase(), p])), alias };
}

function sebutProduk(konteks: Konteks, kode: string): string {
  const p = konteks.produk.get(kode.toUpperCase());
  return p ? `${p.kode} (${p.nama})` : kode;
}

/** Memeriksa aturan tambah dan menyimpan satu alias; `konteks.alias` diperbarui jika tersimpan. */
async function tambahSatu(
  konteks: Konteks,
  { alias: aliasMentah, kodeProduk: kodeMentah }: { alias: string; kodeProduk: string },
  idPengguna: string,
): Promise<HasilTambahAlias> {
  const alias = normalisasiNamaStok(aliasMentah);
  const kodeDiketik = kodeMentah.trim();
  const target = konteks.produk.get(kodeDiketik.toUpperCase());
  const kodeProduk = target?.kode ?? kodeDiketik;
  const tolak = (alasan: string): HasilTambahAlias => ({ keadaan: "ditolak", alias, kodeProduk, alasan });

  if (alias === "") return tolak("Alias wajib diisi.");
  if (kodeDiketik === "") return tolak("Kode produk wajib diisi.");
  if (!target) return tolak(`Kode produk ${kodeDiketik} tidak dikenal.`);

  const pemilikAlias = cocokkanNamaStok(alias, { alias: konteks.alias, produk: [] });
  if (pemilikAlias === kodeProduk) return { keadaan: "sudahAda", alias, kodeProduk };
  if (pemilikAlias !== null) return tolak(`Alias ${alias} sudah dipakai produk ${sebutProduk(konteks, pemilikAlias)}.`);

  const pemilikNama = cocokkanNamaStok(alias, { alias: [], produk: [...konteks.produk.values()] });
  if (pemilikNama !== null && pemilikNama !== kodeProduk) {
    return tolak(`Alias ${alias} sama dengan nama master produk ${sebutProduk(konteks, pemilikNama)}.`);
  }

  // Alias unik ditegakkan primary key; konflik hanya terjadi jika admin lain menambahkannya bersamaan.
  const ditambah = await db
    .insert(aliasNamaStok)
    .values({ alias, kodeProduk, dibuatOleh: idPengguna })
    .onConflictDoNothing({ target: aliasNamaStok.alias })
    .returning({ kodeProduk: aliasNamaStok.kodeProduk });
  if (ditambah.length === 0) {
    const [ada] = await db
      .select({ kodeProduk: aliasNamaStok.kodeProduk })
      .from(aliasNamaStok)
      .where(eq(aliasNamaStok.alias, alias));
    if (ada && ada.kodeProduk === kodeProduk) return { keadaan: "sudahAda", alias, kodeProduk };
    return tolak(ada ? `Alias ${alias} sudah dipakai produk ${sebutProduk(konteks, ada.kodeProduk)}.` : `Alias ${alias} gagal disimpan.`);
  }
  konteks.alias.push({ alias, kodeProduk });
  return { keadaan: "ditambahkan", alias, kodeProduk };
}

export async function tambahAliasStok(
  isian: { alias: string; kodeProduk: string },
  idPengguna: string,
): Promise<HasilTambahAlias> {
  return tambahSatu(await muatKonteks(), isian, idPengguna);
}

/**
 * Menambah alias dari tabel unggahan, baris demi baris, dengan hasil per baris. Baris yang ditolak tidak menahan baris
 * lain. Alias ganda di dalam file (setelah normalisasi): yang pertama diproses, berikutnya ditolak.
 */
export async function tambahAliasDariTabel(
  baris: readonly { nomor: number; alias: string; kodeProduk: string }[],
  idPengguna: string,
): Promise<(HasilTambahAlias & { nomor: number })[]> {
  const konteks = await muatKonteks();
  const barisPertama = new Map<string, number>();
  const hasil: (HasilTambahAlias & { nomor: number })[] = [];
  for (const b of baris) {
    const alias = normalisasiNamaStok(b.alias);
    const pertama = alias === "" ? undefined : barisPertama.get(alias);
    if (pertama !== undefined) {
      const kodeProduk = konteks.produk.get(b.kodeProduk.trim().toUpperCase())?.kode ?? b.kodeProduk.trim();
      hasil.push({ nomor: b.nomor, keadaan: "ditolak", alias, kodeProduk, alasan: `Ganda di file baris ${pertama}.` });
      continue;
    }
    if (alias !== "") barisPertama.set(alias, b.nomor);
    hasil.push({ nomor: b.nomor, ...(await tambahSatu(konteks, b, idPengguna)) });
  }
  return hasil;
}

/** `true` jika alias ada dan dihapus. */
export async function hapusAliasStok(alias: string): Promise<boolean> {
  const dihapus = await db
    .delete(aliasNamaStok)
    .where(eq(aliasNamaStok.alias, normalisasiNamaStok(alias)))
    .returning({ alias: aliasNamaStok.alias });
  return dihapus.length > 0;
}

/** Semua alias beserta kode dan nama produknya, urut alias. */
export async function daftarAliasStok(): Promise<BarisAliasStok[]> {
  return db
    .select({ alias: aliasNamaStok.alias, kodeProduk: aliasNamaStok.kodeProduk, namaProduk: produk.nama })
    .from(aliasNamaStok)
    .innerJoin(produk, eq(produk.kode, aliasNamaStok.kodeProduk))
    .orderBy(asc(aliasNamaStok.alias));
}
