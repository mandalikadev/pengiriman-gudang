import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";

import type { db } from "@/server/db";

// Antrean pg-boss di PostgreSQL yang sama (ADR-0001). Job dikirim di dalam transaksi yang sama dengan
// perubahan pemicunya (pembuatan baris impor, aktivasi impor, kenaikan revisi kalender), sehingga perubahan itu
// selalu punya job-nya.

export const ANTREAN_PROSES_IMPOR = "proses-impor";

/** Menghitung ulang cache laporan (T33). Kebijakan `singleton`: paling banyak satu job aktif sekaligus. */
export const ANTREAN_HITUNG_CACHE_LAPORAN = "hitung-cache-laporan";

export type DataJobProsesImpor = { idImpor: number };

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function urlDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diset.");
  return url;
}

/** Membuat instance pg-boss, menjalankannya, dan memastikan antrean ada. */
export async function mulaiBoss(peran: "pengirim" | "worker") {
  const boss =
    peran === "pengirim"
      ? new PgBoss({ connectionString: urlDatabase(), max: 2, supervise: false, schedule: false, registerInstance: false })
      : new PgBoss({ connectionString: urlDatabase(), instanceName: "worker-impor" });
  boss.on("error", (galat) => console.error("[pg-boss]", galat));
  await boss.start();
  await boss.createQueue(ANTREAN_PROSES_IMPOR);
  await boss.createQueue(ANTREAN_HITUNG_CACHE_LAPORAN, { policy: "singleton" });
  return boss;
}

let pengirim: Promise<PgBoss> | undefined;

function bossPengirim() {
  pengirim ??= mulaiBoss("pengirim").catch((galat: unknown) => {
    pengirim = undefined;
    throw galat;
  });
  return pengirim;
}

/** Mengirim job proses impor di dalam transaksi `tx`. */
export async function kirimJobProsesImpor(tx: Tx, idImpor: number) {
  const boss = await bossPengirim();
  const data: DataJobProsesImpor = { idImpor };
  await boss.send(ANTREAN_PROSES_IMPOR, data, { db: fromDrizzle(tx, sql) });
}

/** Mengirim job hitung ulang cache laporan di dalam transaksi `tx`. Job membaca kunci versi saat mulai. */
export async function kirimJobHitungCacheLaporan(tx: Tx) {
  const boss = await bossPengirim();
  await boss.send(ANTREAN_HITUNG_CACHE_LAPORAN, {}, { db: fromDrizzle(tx, sql) });
}
