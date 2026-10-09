import { CircleCheck, CircleX } from "lucide-react";

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
