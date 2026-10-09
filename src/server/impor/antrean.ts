import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";

import type { db } from "@/server/db";

// Antrean pg-boss di PostgreSQL yang sama (ADR-0001). Job dikirim di dalam transaksi yang sama dengan
// pembuatan baris impor, sehingga impor "diunggah" selalu punya job-nya.

export const ANTREAN_PROSES_IMPOR = "proses-impor";

export type DataJobProsesImpor = { idImpor: number };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  return boss;
}

let pengirim: Promise<PgBoss> | undefined;

/** Mengirim job proses impor di dalam transaksi `tx`. */
export async function kirimJobProsesImpor(tx: Tx, idImpor: number) {
  pengirim ??= mulaiBoss("pengirim").catch((galat: unknown) => {
    pengirim = undefined;
    throw galat;
  });
  const boss = await pengirim;
  const data: DataJobProsesImpor = { idImpor };
  await boss.send(ANTREAN_PROSES_IMPOR, data, { db: fromDrizzle(tx, sql) });
}
