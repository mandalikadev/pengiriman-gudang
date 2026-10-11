import { penggunaSaatIni } from "@/server/auth/kewenangan";
import { daftarGudangDapatDilihat } from "@/server/gudang/akses";
import { bacaRencanaFinal } from "@/server/gudang/rencana-final";

import { buatBerkasEkspor, namaBerkasEkspor } from "./berkas";

// Ekspor rencana final (T64; PRD A7 ▶ Keputusan 2026-10-09): hanya rencana final (draft tidak punya route ekspor),
// termasuk versi lama dari riwayat, dan hanya untuk pengguna dengan hak tindakan `ekspor` di gudang itu. Hak berasal
// dari penugasan; admin tanpa penugasan ditolak (CODING_STANDARDS "Kewenangan"). Sesi dan hak diperiksa di server
// sebelum rencana dibaca. Isinya dari snapshot finalisasi, bukan data terkini.

const ID_VALID = /^\d{1,9}$/;

function tolak(status: number, pesan: string) {
  return Response.json({ pesan }, { status });
}

/** `GET /pengiriman-gudang/<id>/rencana-final/<idRencana>/ekspor`: berkas `.xlsx` satu rencana final. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; idRencana: string }> }) {
  const pengguna = await penggunaSaatIni();
  if (pengguna === null) return tolak(401, "Anda belum masuk atau sesi sudah berakhir. Masuk lagi lalu ulangi ekspor.");

  const { id, idRencana } = await params;
  if (!ID_VALID.test(id) || !ID_VALID.test(idRencana)) return tolak(404, "Rencana final tidak ditemukan.");
  const gudang = (await daftarGudangDapatDilihat(pengguna)).find((g) => g.id === Number(id));
  if (!gudang?.hakTindakan.includes("ekspor")) return tolak(403, "Anda tidak punya hak ekspor di gudang ini.");

  const rencana = await bacaRencanaFinal(gudang.id, Number(idRencana));
  if (rencana === null) return tolak(404, "Rencana final tidak ditemukan.");

  return new Response(new Uint8Array(buatBerkasEkspor(rencana)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${namaBerkasEkspor(rencana)}"`,
      "Cache-Control": "no-store",
    },
  });
}
