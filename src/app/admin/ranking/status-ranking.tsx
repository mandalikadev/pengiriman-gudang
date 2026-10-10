import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import type { StatusVersiRanking } from "@/server/db/schema";

// DESIGN §7: status ikon + teks lewat komponen T07. "Dipublikasikan" (= ranking berlaku) memakai nada dan ikon
// "Aktif" dengan label status ranking itu sendiri.
export function BadgeStatusRanking({ status }: { status: StatusVersiRanking }) {
  if (status === "dipublikasikan") {
    return (
      <Badge variant="success" data-status-ranking={status}>
        <CircleCheck aria-hidden strokeWidth={2} className="size-5" />
        Dipublikasikan
      </Badge>
    );
  }
  return <BadgeStatus status={status} data-status-ranking={status} />;
}

/** Baris ranking yang tidak cocok dengan alias mana pun (menahan publikasi): nada dan ikon error (DESIGN §7). */
export function BadgeTidakCocok() {
  return (
    <Badge variant="destructive" data-penanda="tidak-cocok">
      <CircleX aria-hidden strokeWidth={2} className="size-5" />
      Tidak cocok dengan alias mana pun
    </Badge>
  );
}

/** Baris ranking yang cocok ke keluarga aroma nonaktif: peringatan, tidak menahan publikasi (PRD A6 ▶ 2026-10-10). */
export function BadgeKeluargaNonaktif() {
  return (
    <Badge variant="warning" data-penanda="keluarga-nonaktif">
      <TriangleAlert aria-hidden strokeWidth={2} className="size-5" />
      Keluarga aroma nonaktif
    </Badge>
  );
}

/** Baris ranking yang keluarganya juga muncul di baris lain: menahan publikasi (PRD A6 ▶ 2026-10-10). */
export function BadgeKeluargaGanda() {
  return (
    <Badge variant="destructive" data-penanda="keluarga-ganda">
      <CircleX aria-hidden strokeWidth={2} className="size-5" />
      Keluarga muncul di lebih dari satu baris
    </Badge>
  );
}
