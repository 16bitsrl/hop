import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder of a settings card while it loads. */
export function CardSkeleton({ fields = 2 }: { fields?: number }) {
  const { t } = useTranslation();
  return (
    <Card role="status" aria-label={t("loading")}>
      <CardHeader>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-8 w-full sm:max-w-sm" />
          </div>
        ))}
        <Skeleton className="h-8 w-24" />
      </CardContent>
    </Card>
  );
}
