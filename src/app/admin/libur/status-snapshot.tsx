import { ClipboardList } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import type { StatusSnapshotLibur } from "@/server/db/schema";

// DESIGN §7: "Menunggu persetujuan" memakai nada dan ikon "Siap ditinjau" (menunggu tinjauan admin).
export function BadgeStatusSnapshot({ status }: { status: StatusSnapshotLibur }) {
  if (status === "menunggu-persetujuan") {
    return (
      <Badge variant="default" data-status-snapshot={status}>
        <ClipboardList aria-hidden strokeWidth={2} className="size-5" />
        Menunggu persetujuan
      </Badge>
    );
  }
  return <BadgeStatus status={status} data-status-snapshot={status} />;
}
