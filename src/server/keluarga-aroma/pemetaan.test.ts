import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { keluargaAroma, produk, segmenKodeKeluargaAroma } from "@/server/db/schema";

import { muatPemetaanProduk } from "./pemetaan";

// Usulan hanya dari segmen milik keluarga aktif (PRD A6 ▶ Keputusan 2026-10-10, T67; issue T70).

/** Teks unik per test: database test tidak dikosongkan antar putaran. */
function acak() {
  return randomUUID().slice(0, 8).toUpperCase();
}

async function buatProduk(kode: string) {
  await db
    .insert(produk)
    .values({ kode, nama: `PRODUK ${kode}`, ukuran: "100ML", kategori: "PARFUM WANITA", klasifikasi: "otomatis" });
  return kode;
}

async function buatKeluargaDenganSegmen(segmen: string, aktif = true) {
  const [keluarga] = await db.insert(keluargaAroma).values({ nama: `KELUARGA ${acak()}`, aktif }).returning();
  await db.insert(segmenKodeKeluargaAroma).values({ keluargaId: keluarga.id, segmen });
  return { id: keluarga.id, nama: keluarga.nama };
}

async function usulanUntuk(kode: string) {
  const data = await muatPemetaanProduk(null);
  const baris = data.produk.find((p) => p.kode === kode);
  expect(baris).toBeDefined();
  return { kolom: baris?.usulan ?? null, daftar: data.usulan.find((u) => u.kode === kode)?.usulan ?? null };
}

describe("usulan keluarga aroma mengabaikan segmen keluarga nonaktif", () => {
  it("cocok ke segmen satu keluarga aktif dan satu keluarga nonaktif → keluarga aktif diusulkan", async () => {
    const segmenAktif = `AKT${acak()}`;
    const segmenNonaktif = `NON${acak()}`;
    const aktif = await buatKeluargaDenganSegmen(segmenAktif);
    await buatKeluargaDenganSegmen(segmenNonaktif, false);
    const kode = await buatProduk(`DW110E-${segmenAktif}-${segmenNonaktif}`);

    expect(await usulanUntuk(kode)).toEqual({ kolom: aktif, daftar: aktif });
  });

  it("cocok ke segmen dua keluarga aktif → tidak ada usulan", async () => {
    const segmenPertama = `AKT${acak()}`;
    const segmenKedua = `AKT${acak()}`;
    await buatKeluargaDenganSegmen(segmenPertama);
    await buatKeluargaDenganSegmen(segmenKedua);
    const kode = await buatProduk(`DW110E-${segmenPertama}-${segmenKedua}`);

    expect(await usulanUntuk(kode)).toEqual({ kolom: null, daftar: null });
  });

  it("hanya cocok ke segmen keluarga nonaktif → tidak ada usulan", async () => {
    const segmenNonaktif = `NON${acak()}`;
    await buatKeluargaDenganSegmen(segmenNonaktif, false);
    const kode = await buatProduk(`DW110E-${segmenNonaktif}-R`);

    expect(await usulanUntuk(kode)).toEqual({ kolom: null, daftar: null });
  });

  it("keluarga yang dinonaktifkan kemudian tidak lagi membuat kode ambigu", async () => {
    const segmenTetap = `AKT${acak()}`;
    const segmenLain = `AKT${acak()}`;
    const tetap = await buatKeluargaDenganSegmen(segmenTetap);
    const lain = await buatKeluargaDenganSegmen(segmenLain);
    const kode = await buatProduk(`DD-HAM120-${segmenLain}-${segmenTetap}`);
    expect(await usulanUntuk(kode)).toEqual({ kolom: null, daftar: null });

    await db.update(keluargaAroma).set({ aktif: false }).where(eq(keluargaAroma.id, lain.id));
    expect(await usulanUntuk(kode)).toEqual({ kolom: tetap, daftar: tetap });
  });
});
