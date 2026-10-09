// Worker Node terpisah (ADR-0001): menjalankan job pg-boss untuk membaca dan memvalidasi impor, serta menghitung
// ulang cache laporan (T33).
// Jalankan: pnpm worker
import "dotenv/config";

import type { DataJobProsesImpor } from "../server/impor/antrean";

const { ANTREAN_HITUNG_CACHE_LAPORAN, ANTREAN_PROSES_IMPOR, mulaiBoss } = await import("../server/impor/antrean");
const { pastikanBucket } = await import("../server/impor/penyimpanan");
const { prosesImpor } = await import("../server/impor/proses");
const { hitungUlangCacheLaporan } = await import("../server/laporan/cache");

await pastikanBucket();
const boss = await mulaiBoss("worker");
await boss.work<DataJobProsesImpor>(
  ANTREAN_PROSES_IMPOR,
  { pollingIntervalSeconds: 1, localConcurrency: 4 },
  async ([job]) => {
    await prosesImpor(job.data.idImpor);
  },
);
await boss.work(ANTREAN_HITUNG_CACHE_LAPORAN, { pollingIntervalSeconds: 1, localConcurrency: 1 }, async () => {
  await hitungUlangCacheLaporan();
});
console.log(`Worker impor siap (antrean ${ANTREAN_PROSES_IMPOR}, ${ANTREAN_HITUNG_CACHE_LAPORAN}).`);

async function berhenti() {
  await boss.stop({ graceful: true, timeout: 30_000 });
  process.exit(0);
}
process.on("SIGINT", berhenti);
process.on("SIGTERM", berhenti);
