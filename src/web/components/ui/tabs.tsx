import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("group/tabs flex gap-4 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        /** Segmented control: a pill slides behind the active tab. */
        default: "h-8 rounded-lg bg-muted p-[3px]",
        /** Underlined tabs for page sections: a bar slides under the active tab. */
        line: "w-full gap-1 overflow-x-auto border-b [scrollbar-width:none]",
      },
    },
    defaultVariants: {
      variant: "line",
    },
  }
)

/** Arrow keys move and select (activateOnFocus), Home and End jump, focus wraps around. */
function TabsList({
  className,
  variant = "line",
  children,
  activateOnFocus = true,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      activateOnFocus={activateOnFocus}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        renderBeforeHydration
        className={cn(
          "absolute left-(--active-tab-left) w-(--active-tab-width) transition-[left,width] duration-200 ease-(--ease-snappy)",
          variant === "line"
            ? "bottom-0 h-0.5 rounded-full bg-primary"
            : "top-(--active-tab-top) z-0 h-(--active-tab-height) rounded-md bg-card shadow-(--shadow-raised) dark:bg-accent"
        )}
      />
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative z-[1] inline-flex shrink-0 items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
        "group-data-[variant=default]/tabs-list:h-full group-data-[variant=default]/tabs-list:flex-1 group-data-[variant=default]/tabs-list:rounded-md group-data-[variant=default]/tabs-list:px-2.5",
        "group-data-[variant=line]/tabs-list:rounded-t-md group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:py-2",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("flex-1 text-sm outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
