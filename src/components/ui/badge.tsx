import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// DESIGN §7: latar badge memakai token yang sama dengan opacity 10–15%.
const badgeVariants = cva(
  "inline-flex w-fit max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary",
        secondary: "bg-accent text-accent-foreground",
        success: "bg-success/10 text-success",
        info: "bg-info/10 text-info",
        warning: "bg-warning/10 text-warning",
        destructive: "bg-destructive/10 text-destructive",
        muted: "bg-muted-foreground/10 text-muted-foreground",
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
