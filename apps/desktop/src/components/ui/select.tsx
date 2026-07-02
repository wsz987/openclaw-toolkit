import * as React from "react"
import { cn } from "@/lib/utils"

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          "flex h-10 w-full rounded-md border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-3 py-2 text-sm text-[hsl(var(--ink))] focus-visible:outline-none focus-visible:border-[hsl(var(--primary))] focus-visible:ring-3 focus-visible:ring-[hsl(var(--primary))/0.15] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    )
  }
)
Select.displayName = "Select"

export { Select }
