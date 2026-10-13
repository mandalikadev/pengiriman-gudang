import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { cakupanTanggalImpor, impor, selPenjualan } from "@/server/db/schema";
import { buatTokoUji } from "@/server/gudang/uji-bantu";

import { pastikanBucket } from "./penyimpanan";
import { prosesImpor } from "./proses";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji, tahunUjiBebas } from "./uji-bantu";

// T102: job proses impor bisa diulang pg-boss saat proses pertama masih berjalan.

let idAdmin: string;

beforeAll(async () => {
  await pastikanBucket();
  idAdmin = (await buatPenggunaUji("admin")).id;
});

const HARI = Array.from({ length: 30 }, (_, i) => i + 1);

async function imporBelumDiproses() {
  const toko = await buatTokoUji();
  const isi = buatWorkbookUji({
    "JUNI (S)": sheetPenjualanUji({
      toko: toko.nama,
      bulan: 6,
      hari: HARI,
      produk: [{ kode: kodeProdukUji(), nama: "15ML GLITTER - UJI", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas: HARI.map(() => 1) }],
    }),
  });
  return imporUji({ isi, tahunImpor: await tahunUjiBebas(), idPengguna: idAdmin, proses: false });
}

describe("prosesImpor", () => {
  it("dua pemanggilan bersamaan untuk impor yang sama menghasilkan 30 baris cakupan, bukan 60", async () => {
    const idImpor = await imporBelumDiproses();

    await Promise.all([prosesImpor(idImpor), prosesImpor(idImpor)]);

    const cakupan = await db.select().from(cakupanTanggalImpor).where(eq(cakupanTanggalImpor.imporId, idImpor));
    const sel = await db.select().from(selPenjualan).where(eq(selPenjualan.imporId, idImpor));
    const [baris] = await db.select({ status: impor.status }).from(impor).where(eq(impor.id, idImpor));
    expect(cakupan).toHaveLength(30);
    expect(sel).toHaveLength(30);
    expect(baris.status).toBe("siap-ditinjau");
  });

  it("pemanggilan ulang setelah impor selesai diproses tidak mengubah data", async () => {
    const idImpor = await imporBelumDiproses();
    await prosesImpor(idImpor);
    const [sebelum] = await db.select().from(impor).where(eq(impor.id, idImpor));

    await prosesImpor(idImpor);

    const cakupan = await db.select().from(cakupanTanggalImpor).where(eq(cakupanTanggalImpor.imporId, idImpor));
    const [sesudah] = await db.select().from(impor).where(eq(impor.id, idImpor));
    expect(cakupan).toHaveLength(30);
    expect(sesudah).toEqual(sebelum);
  });
});
