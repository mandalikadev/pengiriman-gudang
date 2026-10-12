import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { normalisasiAlias, normalisasiSegmenKode } from "@/domain/keluarga-aroma";
import { klasifikasiProduk } from "@/domain/produk";
import { tambahAliasDariTabel } from "@/server/alias-stok/alias-stok";
import { db } from "@/server/db";
import { aliasKeluargaAroma, keluargaAroma, produk, segmenKodeKeluargaAroma } from "@/server/db/schema";
import { adminPertama, PESAN_TANPA_ADMIN } from "@/server/gudang/seed-hubungan-jadwal";
import { terapkanPemetaan, type ButirPemetaan } from "@/server/keluarga-aroma/pemetaan";

import berkasAliasStok from "./alias-nama-stok.json";
import berkasKeluarga from "./keluarga-aroma.json";
import berkasPemetaan from "./pemetaan-produk.json";
import berkasProduk from "./produk.json";

// Seed data master (T88, PRD A3 ▶ Keputusan 2026-10-12, UAT kedua): master produk, keluarga aroma (alias + segmen
// kode), pemetaan produk, dan alias nama stok dari berkas data di folder ini (diturunkan dari file pemilik).
// Hanya mengisi yang belum ada; tidak menimpa perubahan admin. Pemetaan dari seed berlaku sebagai konfirmasi admin
// awal dan tercatat di riwayat pemetaan; produk baru dari impor berikutnya tetap lewat usulan + konfirmasi (ADR-0006).

const teks = z.string().trim().min(1);

const skemaProduk = z.array(z.object({ kode: teks, nama: teks, ukuran: teks, kategori: teks }));
const skemaKeluarga = z.array(z.object({ nama: teks, alias: z.array(teks), segmenKode: z.array(teks) }));
const skemaPemetaan = z.array(
  z.discriminatedUnion("status", [
    z.object({ kodeProduk: teks, status: z.literal("terpetakan"), keluarga: teks }),
    z.object({ kodeProduk: teks, status: z.literal("tanpa-aroma"), keluarga: z.null() }),
  ]),
);
const skemaAliasStok = z.array(z.object({ alias: teks, kodeProduk: teks }));

type HasilSeedDataMaster =
  | {
      keadaan: "berhasil";
      produkDitambahkan: number;
      keluargaDitambahkan: number;
      aliasKeluargaDitambahkan: number;
      segmenKodeDitambahkan: number;
      pemetaanDiterapkan: number;
      aliasStokDitambahkan: number;
    }
  | { keadaan: "gagal"; pesan: typeof PESAN_TANPA_ADMIN };

/**
 * Mengisi data master dari berkas data awal, dalam satu transaksi, atas nama admin aktif yang paling awal dibuat
 * (tanpa admin → gagal tanpa menulis apa pun). Idempoten:
 * 1. produk: ditambahkan jika kodenya belum ada, klasifikasi lewat `klasifikasiProduk`; produk yang sudah ada tidak diubah;
 * 2. keluarga aroma: dibuat (aktif) jika belum ada keluarga bernama sama; alias dan segmen kode hanya ditambahkan jika
 *    belum dipakai keluarga mana pun;
 * 3. pemetaan: hanya produk `belum-dipetakan`, lewat `terapkanPemetaan` (aturan dan riwayat sama dengan konfirmasi admin);
 * 4. alias nama stok: lewat aturan tambah T82 (`tambahAliasDariTabel`); alias yang sudah ada tidak diubah.
 */
export async function seedDataMaster(): Promise<HasilSeedDataMaster> {
  const daftarProduk = skemaProduk.parse(berkasProduk);
  const daftarKeluarga = skemaKeluarga.parse(berkasKeluarga);
  const daftarPemetaan = skemaPemetaan.parse(berkasPemetaan);
  const daftarAliasStok = skemaAliasStok.parse(berkasAliasStok);

  return db.transaction(async (tx) => {
    const idAdmin = await adminPertama(tx);
    if (idAdmin === null) return { keadaan: "gagal", pesan: PESAN_TANPA_ADMIN };

    const produkBaru = await tx
      .insert(produk)
      .values(
        daftarProduk.map((p) => {
          const hasil = klasifikasiProduk(p.kode, p.kategori);
          return {
            ...p,
            klasifikasi: hasil.klasifikasi,
            alasanManual: hasil.klasifikasi === "manual" ? hasil.alasan : null,
          };
        }),
      )
      .onConflictDoNothing({ target: produk.kode })
      .returning({ kode: produk.kode });

    let keluargaDitambahkan = 0;
    let aliasKeluargaDitambahkan = 0;
    let segmenKodeDitambahkan = 0;
    const keluargaPerNama = new Map<string, number>();
    for (const k of daftarKeluarga) {
      // Nama keluarga tidak unik di database: keluarga aktif yang paling awal dibuat dipakai.
      const [ada] = await tx
        .select({ id: keluargaAroma.id })
        .from(keluargaAroma)
        .where(eq(keluargaAroma.nama, k.nama))
        .orderBy(desc(keluargaAroma.aktif), asc(keluargaAroma.id))
        .limit(1);
      let idKeluarga = ada?.id;
      if (idKeluarga === undefined) {
        [{ id: idKeluarga }] = await tx.insert(keluargaAroma).values({ nama: k.nama }).returning({ id: keluargaAroma.id });
        keluargaDitambahkan += 1;
      }
      keluargaPerNama.set(k.nama, idKeluarga);

      for (const alias of k.alias) {
        const baru = await tx
          .insert(aliasKeluargaAroma)
          .values({ keluargaId: idKeluarga, alias: normalisasiAlias(alias) })
          .onConflictDoNothing({ target: aliasKeluargaAroma.alias })
          .returning({ id: aliasKeluargaAroma.id });
        aliasKeluargaDitambahkan += baru.length;
      }
      for (const segmen of k.segmenKode) {
        const baru = await tx
          .insert(segmenKodeKeluargaAroma)
          .values({ keluargaId: idKeluarga, segmen: normalisasiSegmenKode(segmen) })
          .onConflictDoNothing({ target: segmenKodeKeluargaAroma.segmen })
          .returning({ id: segmenKodeKeluargaAroma.id });
        segmenKodeDitambahkan += baru.length;
      }
    }

    const belumDipetakan = new Set(
      (
        await tx.select({ kode: produk.kode }).from(produk).where(eq(produk.statusKeluargaAroma, "belum-dipetakan"))
      ).map((p) => p.kode),
    );
    const butir = daftarPemetaan
      .filter((p) => belumDipetakan.has(p.kodeProduk))
      .map((p): ButirPemetaan => {
        if (p.status === "tanpa-aroma") return { kodeProduk: p.kodeProduk, tujuan: { status: "tanpa-aroma" } };
        const idKeluarga = keluargaPerNama.get(p.keluarga);
        if (idKeluarga === undefined) throw new Error(`Keluarga ${p.keluarga} untuk ${p.kodeProduk} tidak ada di berkas keluarga.`);
        return { kodeProduk: p.kodeProduk, tujuan: { status: "terpetakan", idKeluarga } };
      });
    const hasilPemetaan = await terapkanPemetaan(idAdmin, butir, tx);

    const hasilAlias = await tambahAliasDariTabel(
      daftarAliasStok.map((a, i) => ({ nomor: i + 1, ...a })),
      idAdmin,
      tx,
    );

    return {
      keadaan: "berhasil",
      produkDitambahkan: produkBaru.length,
      keluargaDitambahkan,
      aliasKeluargaDitambahkan,
      segmenKodeDitambahkan,
      pemetaanDiterapkan: hasilPemetaan.filter((h) => h.status === "berhasil").length,
      aliasStokDitambahkan: hasilAlias.filter((h) => h.keadaan === "ditambahkan").length,
    };
  });
}
