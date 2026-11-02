import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/lib/theme"

/** Mount once. Then `import { toast } from "sonner"; toast.success("Saved")`. Toasts stack and expand on hover. */
const Toaster = ({ ...props }: ToasterProps) => {
  const [theme] = useTheme()

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      gap={8}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast !shadow-(--shadow-overlay) !text-sm !font-normal",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
