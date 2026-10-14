import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// DESIGN §4: rounded-3xl, bingkai border/60, bayangan shadow-soft.
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-6 text-card-foreground shadow-soft",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1", className)} {...props} />;
}

/** `level`: tingkat heading judul kartu sesuai urutan heading halaman (DESIGN §11.8); bawaan h3. */
export function CardTitle({ className, level = 3, ...props }: ComponentProps<"h3"> & { level?: 2 | 3 | 4 }) {
  const Heading = `h${level}` as const;
  return <Heading data-slot="card-title" className={cn("text-xl font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("text-sm", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center gap-2", className)} {...props} />;
}
