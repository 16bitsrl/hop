import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "../components/auth-layout";
import { FormField } from "@/components/form-field";
import { LoadingState } from "@/components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { meQuery } from "../lib/session";

type Request = { code: string; name: string; createdAt: string };

function Outcome({ icon, text, children }: { icon: ReactNode; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 text-sm text-pretty [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0">
        {icon}
        {text}
      </p>
      {children}
    </div>
  );
}

/** Someone ran the sign-in in a terminal and has the code but not the link, e.g. on another computer. */
export function CliCodePage() {
  const { t } = useTranslation("cli");
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    void navigate({ to: "/cli/$code", params: { code: code.trim() } });
  }

  return (
    <AuthCard title={t("title")} description={t("description")}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <FormField label={t("code")} hint={t("enter.hint")}>
          {(id) => (
            <Input
              id={id}
              required
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="ABCD-EFGH"
              className="font-mono tracking-widest uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          )}
        </FormField>
        <Button type="submit">{t("enter.submit")}</Button>
      </form>
    </AuthCard>
  );
}

/** The page `hop login` opens: shows which device is asking and lets the signed-in person accept or refuse. */
export function CliLoginPage() {
  const { t } = useTranslation("cli");
  const { code } = useParams({ from: "/cli/$code" });
  const { data: me } = useQuery(meQuery);
  const [outcome, setOutcome] = useState<"approved" | "denied" | null>(null);

  const request = useQuery({
    queryKey: ["cli-login", code],
    queryFn: () => api<Request>(`/api/cli/login/${encodeURIComponent(code)}`),
    retry: false,
    staleTime: Infinity,
  });
  const answer = useMutation({
    mutationFn: (what: "approve" | "deny") => api(`/api/cli/login/${encodeURIComponent(code)}/${what}`, { method: "POST" }),
    onSuccess: (_data, what) => setOutcome(what === "approve" ? "approved" : "denied"),
  });

  if (outcome === "approved") {
    return (
      <AuthCard title={t("done.title")}>
        <Outcome icon={<CircleCheckIcon className="text-success" />} text={t("done.text")} />
      </AuthCard>
    );
  }
  if (outcome === "denied") {
    return (
      <AuthCard title={t("denied.title")}>
        <Outcome icon={<CircleAlertIcon className="text-muted-foreground" />} text={t("denied.text")} />
      </AuthCard>
    );
  }
  if (request.isPending) return <LoadingState className="min-h-dvh" />;
  if (request.isError) {
    return (
      <AuthCard title={t("invalid.title")}>
        <Outcome icon={<CircleAlertIcon className="text-muted-foreground" />} text={t("invalid.text")}>
          <Link to="/links" className={buttonVariants({ variant: "outline" })}>
            {t("common:goHome")}
          </Link>
        </Outcome>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("title")} description={t("description")}>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-[13px] text-muted-foreground">{t("device")}</dt>
          <dd className="font-medium break-words">{request.data.name}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted-foreground">{t("code")}</dt>
          <dd className="mt-1 rounded-md bg-muted px-3 py-2 text-center font-mono text-lg font-semibold tracking-[0.2em]">{request.data.code}</dd>
          <dd className="mt-1 text-[13px] text-pretty text-muted-foreground">{t("codeCheck")}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted-foreground">{t("account")}</dt>
          <dd className="font-medium break-all">{me?.email}</dd>
        </div>
      </dl>
      <Alert variant="warning" className="mt-4">
        <TriangleAlertIcon />
        <AlertDescription>{t("warning")}</AlertDescription>
      </Alert>
      {answer.isError && (
        <Alert variant="destructive" className="mt-3">
          <CircleAlertIcon />
          <AlertDescription>{errorMessage(t, answer.error)}</AlertDescription>
        </Alert>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <Button loading={answer.isPending && answer.variables === "approve"} disabled={answer.isPending} onClick={() => answer.mutate("approve")}>
          {t("connect")}
        </Button>
        <Button variant="ghost" disabled={answer.isPending} onClick={() => answer.mutate("deny")}>
          {t("cancel")}
        </Button>
      </div>
    </AuthCard>
  );
}
