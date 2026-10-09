// Worker Node terpisah (ADR-0001): menjalankan job pg-boss untuk membaca dan memvalidasi impor.
// Jalankan: pnpm worker
import "dotenv/config";

import type { DataJobProsesImpor } from "../server/impor/antrean";

const { ANTREAN_PROSES_IMPOR, mulaiBoss } = await import("../server/impor/antrean");
const { pastikanBucket } = await import("../server/impor/penyimpanan");
const { prosesImpor } = await import("../server/impor/proses");

await pastikanBucket();
const boss = await mulaiBoss("worker");
await boss.work<DataJobProsesImpor>(
  ANTREAN_PROSES_IMPOR,
  { pollingIntervalSeconds: 1, localConcurrency: 4 },
  async ([job]) => {
    await prosesImpor(job.data.idImpor);
  },
);
console.log(`Worker impor siap (antrean ${ANTREAN_PROSES_IMPOR}).`);

async function berhenti() {
  await boss.stop({ graceful: true, timeout: 30_000 });
  process.exit(0);
}
process.on("SIGINT", berhenti);
process.on("SIGTERM", berhenti);
