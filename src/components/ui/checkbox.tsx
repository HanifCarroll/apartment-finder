import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export function Checkbox({ className, checked, ...props }: CheckboxProps) {
  return (
    <label className="relative inline-flex h-5 w-5 items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        className={cn(
          "peer h-5 w-5 appearance-none rounded border bg-card outline-none transition-colors checked:bg-primary focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...props}
      />
      <Check className="pointer-events-none absolute h-3.5 w-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100" />
    </label>
  );
}
