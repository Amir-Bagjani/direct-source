"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/ui/button/button";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { Badge } from "@/shared/ui/badge/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/shared/ui/card/card";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { BusinessForm } from "../business-form/business-form";
import { VerificationSectionForm } from "../verification-section/verification-section";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeOnboarding } from "../../api/onboarding.api";
import { identitySchema, activitySchema } from "../../schemas/onboarding.schema";
import type { BusinessWizardProps } from "./business-wizard.types";
const steps = ["profile", "identity", "activity", "review"] as const;
export function BusinessWizard({ userId, business, sections, onCheck }: BusinessWizardProps) {
  const t = useTranslations("accounts.workspace");
  const o = useTranslations("accounts.onboarding");
  const b = useTranslations("accounts.business");
  const params = useSearchParams();
  const current = steps.find((s) => s === params.get("step")) ?? "identity";
  const index = steps.indexOf(current);
  const heading = useRef<HTMLHeadingElement>(null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const unsaved = Object.values(dirty).some(Boolean);
  const editable = ["draft", "changes_requested"].includes(business.status);
  const canEditProfile =
    business.status === "draft" ||
    (business.status === "changes_requested" &&
      sections.some((s) => s.kind === "activity" && s.status === "changes_requested"));
  const submit = useOnboardingMutation(userId, () => writeOnboarding("submit", business.id));
  const complete = sections.every(
    (s) =>
      s.status === "approved" ||
      (s.kind === "identity"
        ? identitySchema.safeParse(s.data).success
        : activitySchema.safeParse(s.data).success),
  );
  function go(step: (typeof steps)[number]) {
    const url = new URL(window.location.href);
    url.searchParams.set("step", step);
    window.history.pushState(null, "", url);
    heading.current?.focus();
  }
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    const leave = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        link instanceof HTMLAnchorElement &&
        link.origin === location.origin &&
        link.pathname !== location.pathname &&
        !link.target &&
        !window.confirm(t("unsaved"))
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
    };
  }, [unsaved, t]);
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t("verification")}>
        <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step}>
              <Button
                variant={step === current ? "secondary" : "ghost"}
                className="w-full"
                aria-current={step === current ? "step" : undefined}
                onClick={() => go(step)}
              >
                {t(`${step}Step`)}
              </Button>
            </li>
          ))}
        </ol>
      </nav>
      <Alert>
        <AlertDescription>{t("saveHint")}</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 ref={heading} tabIndex={-1}>
              {t(`${current}Step`)}
            </h2>
          </CardTitle>
          <CardDescription>
            <Badge variant="secondary">{b(`statuses.${business.status}`)}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div
            hidden={current !== "profile"}
            onChange={() => setDirty((v) => ({ ...v, profile: true }))}
          >
            {canEditProfile ? (
              <BusinessForm
                userId={userId}
                initialBusiness={business}
                onSaved={() => {
                  setDirty((v) => ({ ...v, profile: false }));
                  go("identity");
                }}
                onCheck={onCheck}
              />
            ) : (
              <p>
                <bdi>{business.name}</bdi> — {t("readonly")}
              </p>
            )}
          </div>
          {sections.map((section) => (
            <div
              key={section.kind}
              hidden={current !== section.kind}
              onChange={() => setDirty((v) => ({ ...v, [section.kind]: true }))}
            >
              <VerificationSectionForm
                userId={userId}
                businessId={business.id}
                section={section}
                editable={editable && ["draft", "changes_requested"].includes(section.status)}
                onSaved={() => {
                  setDirty((v) => ({ ...v, [section.kind]: false }));
                  go(section.kind === "identity" ? "activity" : "review");
                }}
              />
            </div>
          ))}
          <div hidden={current !== "review"} className="flex flex-col gap-5">
            <p>{t("reviewHint")}</p>
            {sections.map((section) => (
              <div key={section.kind} className="flex flex-wrap items-center justify-between gap-3">
                <span>{o(section.kind)}</span>
                <Badge variant="secondary">{o(`statuses.${section.status}`)}</Badge>
                {section.reason && (
                  <p className="w-full" dir="auto">
                    {section.reason}
                  </p>
                )}
              </div>
            ))}
            {editable && (
              <Button
                disabled={submit.isPending || !complete || unsaved}
                onClick={() => submit.mutate()}
              >
                {o("submit")}
              </Button>
            )}
            {submit.isError && (
              <Alert variant="destructive">
                <AlertDescription>{o("submitError")}</AlertDescription>
              </Alert>
            )}
            {submit.isSuccess && <p role="status">{o("saved")}</p>}
            {["verified", "suspended"].includes(business.status) && (
              <Link
                href="/account/business/revisions"
                className={buttonVariants({ variant: "outline" })}
              >
                {t("revisions")}
              </Link>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between gap-3">
          <Button
            variant="outline"
            disabled={index === 0}
            onClick={() => go(steps[index - 1] ?? "profile")}
          >
            {t("previous")}
          </Button>
          <Button
            variant="outline"
            disabled={index === 3}
            onClick={() => go(steps[index + 1] ?? "review")}
          >
            {t("next")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
