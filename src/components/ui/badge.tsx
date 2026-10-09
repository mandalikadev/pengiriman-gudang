import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// DESIGN §7 (Keputusan 2026-10-09): latar = token status opacity 10%, ikon = warna token status,
// teks = foreground agar kontras teks tetap ≥ 4,5 : 1 (dijaga tests/kontras.test.ts).
const badgeVariants = cva(
  "inline-flex w-fit max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold [&>svg]:size-5 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-foreground [&>svg]:text-primary",
        success: "bg-success/10 text-foreground [&>svg]:text-success",
        info: "bg-info/10 text-foreground [&>svg]:text-info",
        warning: "bg-warning/10 text-foreground [&>svg]:text-warning",
        destructive: "bg-destructive/10 text-foreground [&>svg]:text-destructive",
        muted: "bg-muted-foreground/10 text-foreground [&>svg]:text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type NadaBadge = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
