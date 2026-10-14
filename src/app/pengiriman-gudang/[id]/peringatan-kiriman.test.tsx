import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { parseTanggalBisnis } from "@/domain/kalender";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko } from "@/server/db/schema";
import { bacaDraftRencana, hitungDraftRencana } from "@/server/gudang/draft-rencana";
import { daftarHakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { finalisasiRencanaToko } from "@/server/gudang/rencana-final";
import { simpanStokToko } from "@/server/gudang/stok-draft";
import { bersihkanTokoSmbUji, siapkanTokoSmbUji } from "@/server/gudang/uji-bantu-cakupan";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import HalamanPengirimanGudang from "./page";

// T93: peringatan "kiriman sebelumnya belum sampai" di draft per toko (PRD A6 ▶ Keputusan 2026-10-12, UAT ketiga).
// Toko A: 3× seminggu Senin (H−1), Selasa (H−1), Jumat (H); kirim Selasa 2026-10-20 → persiapan Senin 19 = tanggal kirim
// sebelumnya → peringatan. Toko B: 1× seminggu Selasa (H−2) → tidak pernah ada peringatan.

const SELASA = "2026-10-20";
const PERINGATAN_A = "Kiriman Senin, 19-10-2026 belum sampai saat persiapan. Pastikan jumlahnya ikut dihitung di stok akhir.";

let bandung: number;
let tokoA: { id: number; nama: string };
let tokoB: { id: number; nama: string };
let kodeProduk: string;
let idOperator: string;
let cookieOperator: string;

beforeAll(async () => {
  const idAdmin = (await buatPenggunaUji("admin")).id;
  bandung = await idGudangUji("Gudang Bandung");
  ({ toko: tokoA, kodeProduk } = await siapkanTokoSmbUji({ idGudang: bandung, idAdmin }));
  await db
    .update(jadwalToko)
    .set({
      pola: "3x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapanHari: 1 },
        { hari: "Selasa", persiapanHari: 1 },
        { hari: "Jumat", persiapanHari: 0 },
      ],
    })
    .where(eq(jadwalToko.tokoId, tokoA.id));
  tokoB = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: tokoB.id, gudangId: bandung });
  await db.insert(jadwalToko).values({ tokoId: tokoB.id, pola: "mingguan", hariKirim: [{ hari: "Selasa", persiapanHari: 2 }], dibuatOleh: idAdmin });

  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang: bandung, hakTindakan: [...daftarHakTindakan] });
  idOperator = operator.id;
  cookieOperator = operator.cookie;
  const tanggalKirim = parseTanggalBisnis(SELASA);
  const hasil = await hitungDraftRencana({ idGudang: bandung, tanggalKirim, idPengguna: idOperator });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  expect(await simpanStokToko({ idGudang: bandung, tanggalKirim, tokoId: tokoA.id, stok: [{ kodeProduk, stokAkhir: 10 }] })).toEqual({
    keadaan: "berhasil",
  });
}, 120_000);

afterAll(async () => {
  await bersihkanTokoSmbUji({ idGudang: bandung, idToko: tokoA.id });
  await db.delete(hubunganTokoGudang).where(eq(hubunganTokoGudang.tokoId, tokoB.id));
});

const bukaToko = async (tokoId: number) =>
  renderToStaticMarkup(
    await HalamanPengirimanGudang({
      params: Promise.resolve({ id: String(bandung) }),
      searchParams: Promise.resolve({ tanggal: SELASA, toko: String(tokoId) }),
    }),
  );

describe('peringatan "kiriman sebelumnya belum sampai" di draft per toko', () => {
  it("toko yang memenuhi syarat: peringatan ikon + teks dengan tanggal format aplikasi; finalisasi tetap tersedia dan angka tidak berubah", async () => {
    kepala.cookie = cookieOperator;
    const html = await bukaToko(tokoA.id);
    expect(html).toMatch(
      new RegExp(`data-draft-toko="${tokoA.id}".*?data-kiriman-sebelumnya-belum-sampai="2026-10-19"[^>]*>.*?<svg[^>]*text-warning.*?${PERINGATAN_A}`),
    );
    // Cakupan Senin–Kamis 19–22 Okt (p = 1, L = 3) × 5 = 20; stok target (PRD A6 ▶ Revisi 2026-10-14): 20 × 120% − 10 = 14.
    expect(html).toMatch(new RegExp(`data-kode-produk="${kodeProduk}".*?data-jumlah-kirim="14"`));
    expect(html).toContain(`data-finalisasi-toko="${tokoA.id}"`);
    expect(html).not.toContain("data-finalisasi-tertahan");
  });

  it("toko yang tidak memenuhi syarat (1× seminggu, p = 2) di draft yang sama: tanpa peringatan", async () => {
    kepala.cookie = cookieOperator;
    const html = await bukaToko(tokoB.id);
    expect(html).toContain(`data-draft-toko="${tokoB.id}"`);
    expect(html).not.toContain("data-kiriman-sebelumnya-belum-sampai");
    expect(html).not.toContain("belum sampai saat persiapan");
  });

  it("pengguna hanya-baca (admin) juga melihat peringatan", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await bukaToko(tokoA.id);
    expect(html).toContain("data-hanya-baca");
    expect(html).toContain(PERINGATAN_A);
  });

  it("peringatan tidak menahan finalisasi", async () => {
    const tanggalKirim = parseTanggalBisnis(SELASA);
    const versiDilihat = (await bacaDraftRencana(bandung, tanggalKirim))?.toko.find((t) => t.id === tokoA.id)?.versi ?? "";
    const hasil = await finalisasiRencanaToko({ idGudang: bandung, tanggalKirim, tokoId: tokoA.id, idPengguna: idOperator, versiDilihat });
    expect(hasil).toMatchObject({ keadaan: "berhasil" });
  });
});
