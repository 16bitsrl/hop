import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, CardBody, CardHeader, Field, Input, PageSpinner, useToast } from "../../components/ui";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";

const settingsQuery = {
  queryKey: ["stats-settings"],
  queryFn: () => api<{ retentionDays: number | null }>("/api/stats/settings"),
  staleTime: 0,
};

/** Settings card (admins): how long click history is kept. Empty = forever. */
export function RetentionCard() {
  const { data } = useQuery(settingsQuery);
  return data ? <RetentionForm days={data.retentionDays} /> : <PageSpinner />;
}

function RetentionForm({ days }: { days: number | null }) {
  const { t } = useTranslation("stats");
  const toast = useToast();
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
      <CardHeader title={t("retention.title")} description={t("retention.description")} />
      <CardBody>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t("retention.days")} hint={t("retention.hint")} className="sm:max-w-xs">
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
          </Field>
          <div>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {t("retention.save")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
