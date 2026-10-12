import { randomInt } from "node:crypto";

import { like } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { versiRanking } from "@/server/db/schema";

import { kunciObjekRankingBaru } from "./ranking";
import { tahunRankingUjiBebas } from "./uji-bantu";

// T96: tahun ranking uji acak tidak boleh bentrok dengan versi ranking buatan berkas test lain di database test bersama.
vi.mock("node:crypto", async (asli) => {
  const modul = await asli<typeof import("node:crypto")>();
  return { ...modul, randomInt: vi.fn(modul.randomInt) };
});

const acak = vi.mocked(randomInt as (min: number, max: number) => number);

let idAdmin: string;
const sudahDikembalikan = new Set<number>();

async function tahunBelumAdaDiRanking() {
  for (;;) {
    const tahun = acak(3000, 9000);
    if (sudahDikembalikan.has(tahun)) continue;
    const ada = await db.select({ id: versiRanking.id }).from(versiRanking).where(like(versiRanking.bulanRanking, `${tahun}-%`)).limit(1);
    if (ada.length === 0) return tahun;
  }
}

async function ambil() {
  const tahun = await tahunRankingUjiBebas();
  sudahDikembalikan.add(tahun);
  return tahun;
}

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
});

describe("tahunRankingUjiBebas", () => {
  it("dua pemanggilan berurutan sebelum insert memberi tahun berbeda, walaupun kandidat acaknya sama", async () => {
    const kandidat = await tahunBelumAdaDiRanking();
    acak.mockReturnValueOnce(kandidat).mockReturnValueOnce(kandidat);

    expect(await ambil()).toBe(kandidat);
    expect(await ambil()).not.toBe(kandidat);
  });

  it("tahun yang sudah dipakai versi ranking tidak dikembalikan", async () => {
    const dipakai = await tahunBelumAdaDiRanking();
    await db.insert(versiRanking).values({
      bulanRanking: `${dipakai}-01`,
      versi: 1,
      namaFile: "RANKING-UJI.xlsx",
      ukuranByte: 1,
      kunciObjek: kunciObjekRankingBaru(),
      diunggahOleh: idAdmin,
    });
    acak.mockReturnValueOnce(dipakai);
    const panggilanSebelum = acak.mock.calls.length;

    expect(await ambil()).not.toBe(dipakai);
    expect(acak.mock.calls.length - panggilanSebelum).toBeGreaterThanOrEqual(2);
  });
});
