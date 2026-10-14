"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";

type ExportButtonProps = {
  onExport: () => void | Promise<void>;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function ExportButton({
  onExport,
  disabled,
  label = "ייצוא לאקסל",
  size = "md",
  className,
}: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  async function handleClick() {
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      onClick={handleClick}
      disabled={disabled || exporting}
      className={clsx("shrink-0", className)}
    >
      {exporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {exporting ? "מייצא..." : label}
    </Button>
  );
}
