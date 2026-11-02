import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CardSkeleton } from "../../components/card-skeleton";
import { FormField } from "../../components/form-field";
import { ErrorState } from "../../components/states";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { toast } from "../../lib/toast";

const settingsQuery = {
  queryKey: ["stats-settings"],
  queryFn: () => api<{ retentionDays: number | null }>("/api/stats/settings"),
  staleTime: 0,
};

/** Settings card (admins): how long click history is kept. Empty = forever. */
export function RetentionCard() {
  const { data, isError, isFetching, refetch } = useQuery(settingsQuery);
  if (data) return <RetentionForm days={data.retentionDays} />;
  if (isError)
    return (
      <Card>
        <ErrorState onRetry={() => refetch()} retrying={isFetching} />
      </Card>
    );
  return <CardSkeleton fields={1} />;
}

function RetentionForm({ days }: { days: number | null }) {
  const { t } = useTranslation("stats");
  const queryClient = useQueryClient();
  const [value, setValue] = useState(days === null ? "" : String(days));
  const save = useMutation({
    mutationFn: (retentionDays: number | null) => api("/api/stats/settings", { method: "PUT", body: { retentionDays } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsQuery.queryKey });
      toast.success(t("common:saved"));
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    save.mutate(trimmed === "" ? null : Number(trimmed));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("retention.title")}</CardTitle>
        <CardDescription>{t("retention.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormField label={t("retention.days")} hint={t("retention.hint")} className="sm:max-w-xs">
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                max={3650}
                step={1}
                placeholder={t("retention.forever")}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </FormField>
          <div>
            <Button type="submit" loading={save.isPending}>
              {t("retention.save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
