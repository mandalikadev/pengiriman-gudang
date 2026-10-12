import { randomInt } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { impor } from "@/server/db/schema";

import { kunciObjekBaru } from "./impor";
import { tahunUjiBebas } from "./uji-bantu";

// T96: tahun uji acak tidak boleh bentrok dengan impor buatan berkas test lain di database test bersama.
// `randomInt` dibuat bisa diatur agar tahun kandidat yang bentrok pasti diajukan lebih dulu.
vi.mock("node:crypto", async (asli) => {
  const modul = await asli<typeof import("node:crypto")>();
  return { ...modul, randomInt: vi.fn(modul.randomInt) };
});

const acak = vi.mocked(randomInt as (min: number, max: number) => number);

let idAdmin: string;
/** Tahun yang sudah dikembalikan helper di berkas ini (sudah dicadangkan). */
const sudahDikembalikan = new Set<number>();

async function tahunBelumAdaDiImpor() {
  for (;;) {
    const tahun = acak(3000, 9000);
    if (sudahDikembalikan.has(tahun)) continue;
    if ((await db.select({ id: impor.id }).from(impor).where(eq(impor.tahunImpor, tahun)).limit(1)).length === 0) return tahun;
  }
}

async function ambil() {
  const tahun = await tahunUjiBebas();
  sudahDikembalikan.add(tahun);
  return tahun;
}

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
});

describe("tahunUjiBebas", () => {
  it("dua pemanggilan berurutan sebelum insert memberi tahun berbeda, walaupun kandidat acaknya sama", async () => {
    const kandidat = await tahunBelumAdaDiImpor();
    acak.mockReturnValueOnce(kandidat).mockReturnValueOnce(kandidat);

    const pertama = await ambil();
    const kedua = await ambil();

    expect(pertama).toBe(kandidat);
    expect(kedua).not.toBe(kandidat);
  });

  it("tahun yang sudah ada di impor tidak dikembalikan", async () => {
    const dipakai = await tahunBelumAdaDiImpor();
    await db.insert(impor).values({
      namaFile: "penjualan-uji.xlsx",
      ukuranByte: 1,
      kunciObjek: kunciObjekBaru(),
      namaSheet: "JUNI (S)",
      tahunImpor: dipakai,
      bulanImpor: 6,
      diunggahOleh: idAdmin,
    });
    acak.mockReturnValueOnce(dipakai);
    const panggilanSebelum = acak.mock.calls.length;

    const tahun = await ambil();

    expect(tahun).not.toBe(dipakai);
    expect(acak.mock.calls.length - panggilanSebelum).toBeGreaterThanOrEqual(2);
  });

  it("tahun yang dikembalikan berada di rentang 3000–8999", async () => {
    for (let i = 0; i < 20; i++) {
      const tahun = await ambil();
      expect(tahun).toBeGreaterThanOrEqual(3000);
      expect(tahun).toBeLessThanOrEqual(8999);
    }
  });
});
