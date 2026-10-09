import { CircleCheck, CircleDashed, CircleX, ClipboardList, TriangleAlert, type LucideIcon } from "lucide-react";

import { Badge, type NadaBadge } from "@/components/ui/badge";
import type { StatusKeluargaAroma } from "@/server/db/schema";
import type { HasilPemetaanProduk, Pemetaan } from "@/server/keluarga-aroma/pemetaan";

// DESIGN §7: status selalu ikon + teks; warna ikon dari token status, teks foreground. Pemetaan memakai token dan ikon
// yang sudah ada: terpetakan = berhasil, tanpa aroma = tidak tersedia, belum dipetakan = peringatan (menahan finalisasi,
// ADR-0006), usulan = menunggu tinjauan admin ("Siap ditinjau").
const tampilanStatus = {
  terpetakan: { label: "Terpetakan", nada: "success", ikon: CircleCheck },
  "tanpa-aroma": { label: "Tanpa aroma", nada: "muted", ikon: CircleDashed },
  "belum-dipetakan": { label: "Belum dipetakan", nada: "warning", ikon: TriangleAlert },
} as const satisfies Record<StatusKeluargaAroma, { label: string; nada: NadaBadge; ikon: LucideIcon }>;

export const daftarFilterStatus = Object.entries(tampilanStatus).map(([status, { label }]) => ({
  status: status as StatusKeluargaAroma,
  label,
}));

/** Mis. "Terpetakan: GORGEOUS TUBEROSE", "Tanpa aroma", "Belum dipetakan". */
export function labelPemetaan({ status, keluarga }: Pemetaan) {
  const { label } = tampilanStatus[status];
  return keluarga ? `${label}: ${keluarga.nama}` : label;
}

export function BadgeStatusPemetaan({ status }: { status: StatusKeluargaAroma }) {
  const { label, nada, ikon: Ikon } = tampilanStatus[status];
  return (
    <Badge variant={nada} data-status-pemetaan={status}>
      <Ikon aria-hidden strokeWidth={2} className="size-5" />
      {label}
    </Badge>
  );
}

export function BadgeUsulan({ nama }: { nama: string }) {
  return (
    <Badge variant="default" data-usulan>
      <ClipboardList aria-hidden strokeWidth={2} className="size-5" />
      Usulan: {nama}
    </Badge>
  );
}

const tampilanHasil = {
  berhasil: { label: "Berhasil", nada: "success", ikon: CircleCheck },
  tidakBerubah: { label: "Tidak berubah", nada: "success", ikon: CircleCheck },
  gagal: { label: "Gagal", nada: "destructive", ikon: CircleX },
} as const satisfies Record<HasilPemetaanProduk["status"], { label: string; nada: NadaBadge; ikon: LucideIcon }>;

export function BadgeHasilPemetaan({ status }: { status: HasilPemetaanProduk["status"] }) {
  const { label, nada, ikon: Ikon } = tampilanHasil[status];
  return (
    <Badge variant={nada} data-hasil={status}>
      <Ikon aria-hidden strokeWidth={2} className="size-5" />
      {label}
    </Badge>
  );
}

/** Keterangan hasil satu produk untuk tabel hasil per produk. */
export function keteranganHasil(hasil: HasilPemetaanProduk) {
  if (hasil.status === "berhasil") return `${labelPemetaan(hasil.dari)} → ${labelPemetaan(hasil.ke)}`;
  if (hasil.status === "tidakBerubah") return `Sudah berstatus ${labelPemetaan(hasil.ke)}; tidak ada yang diubah.`;
  return hasil.pesan;
}
