import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-xs/relaxed font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border hover:bg-input/50 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-input/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-7 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-5 gap-1 rounded-sm px-2 text-[0.625rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-6 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-8 gap-1 px-2.5 text-xs/relaxed has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs": "size-5 rounded-sm [&_svg:not([class*='size-'])]:size-2.5",
        "icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-lg": "size-8 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ShadcnButtonProps = ButtonPrimitive.Props &
  Omit<VariantProps<typeof buttonVariants>, "variant" | "size">

export type ButtonProps = ShadcnButtonProps & {
  /** Compatibility props for unmigrated screens; new code uses shadcn variants. */
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link" | "primary" | "subtle"
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" | "compact" | "comfortable"
  loading?: boolean
  iconBefore?: React.ReactNode
  iconAfter?: React.ReactNode
  fullWidth?: boolean
}

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  iconBefore,
  iconAfter,
  fullWidth = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const resolvedVariant = variant === "primary" ? "default" : variant === "subtle" ? "ghost" : variant
  const resolvedSize = size === "compact" ? "sm" : size === "comfortable" ? "lg" : size
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant: resolvedVariant, size: resolvedSize, className }), fullWidth && "w-full")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {iconBefore ? <span data-icon="inline-start" aria-hidden="true">{iconBefore}</span> : null}
      {children}
      {iconAfter ? <span data-icon="inline-end" aria-hidden="true">{iconAfter}</span> : null}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
