"use client";
import { useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/shared/api/unwrap";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/shared/ui/card/card";
import { Badge } from "@/shared/ui/badge/badge";
import { Button } from "@/shared/ui/button/button";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Skeleton } from "@/shared/ui/skeleton/skeleton";
import { PrivateQueryRegion } from "@/shared/ui/private-query-region/private-query-region";
import { ProtectedSessionContext } from "../protected-session-boundary/protected-session-context";
import { useProtectedSession } from "../protected-session-boundary/protected-session-context";
import { useRetainedQueryData } from "@/shared/hooks/use-retained-query-data";
import { accountKeys } from "../../queries/accounts.keys";
import { businessOptions } from "../../queries/business.queries";
import { sectionsOptions } from "../../queries/onboarding.queries";
import { trustOptions } from "../../queries/trust.queries";
import { trustAccessSchema } from "../../schemas/trust.schema";
import { EmailSettings } from "../email-settings/email-settings";
import { BusinessForm } from "../business-form/business-form";
import { BusinessRevisions } from "../business-revisions/business-revisions";
import { AccountHistory } from "../account-history/account-history";
import { VerificationReview } from "../verification-review/verification-review";
import { TrustPanel } from "../trust-panel/trust-panel";
import { ReviewCase } from "../review-case/review-case";
import { BusinessWizard } from "../business-wizard/business-wizard";
import { identitySchema, activitySchema } from "../../schemas/onboarding.schema";
import { onboardingUrl } from "../../api/onboarding.api";
import type { AccountScreenProps } from "./account-screen.types";

export function AccountScreen({ view, businessId }: AccountScreenProps) {
  const t = useTranslations("accounts.workspace");
  const account = useTranslations("accounts.account");
  const b = useTranslations("accounts.business");
  const o = useTranslations("accounts.onboarding");
  const common = useTranslations("common");
  const recovery = useTranslations("accounts.recovery");
  const session = useProtectedSession();
  const { user, authorized } = session;
  const [editing, setEditing] = useState(false);
  const needsBusiness = !["profile", "security", "operations", "trust", "case"].includes(view);
  const business = useQuery({ ...businessOptions(user.id), enabled: authorized && needsBusiness });
  const businessData = useRetainedQueryData(business, accountKeys.business(user.id));
  const sections = useQuery({
    ...sectionsOptions(user.id, businessData?.id ?? ""),
    enabled:
      authorized &&
      !!businessData &&
      ["business", "verification", "documents", "revisions"].includes(view),
  });
  const sectionsData = useRetainedQueryData(
    sections,
    accountKeys.sections(user.id, businessData?.id ?? ""),
  );
  const role = useQuery({
    ...trustOptions(user.id, "access", trustAccessSchema),
    enabled: authorized && ["operations", "trust", "case"].includes(view),
  });
  const roleData = useRetainedQueryData(
    role,
    accountKeys.trust(user.id, "access", "", 1, "suspension"),
  );
  const title = (
    <header className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold">{t(view)}</h1>
      {view === "overview" && (
        <p>
          <bdi>
            {user.first_name} {user.last_name}
          </bdi>
        </p>
      )}
      <p className="max-w-2xl text-muted-foreground">
        {t(view === "overview" ? "intro" : `${view}Hint`)}
      </p>
    </header>
  );
  const retryBusiness = (
    <>
      <Alert variant="destructive">
        <AlertDescription>{b("loadError")}</AlertDescription>
      </Alert>
      <Button className="self-start" onClick={() => void business.refetch()}>
        {common("retry")}
      </Button>
    </>
  );
  let content;
  if (view === "profile")
    content = (
      <Card>
        <CardHeader>
          <CardTitle>{t("identitySummary")}</CardTitle>
          <CardDescription>{t("readonly")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">{account("name")}</dt>
              <dd>
                <bdi>
                  {user.first_name} {user.last_name}
                </bdi>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{account("mobile")}</dt>
              <dd>
                <bdi dir="ltr">{user.mobile}</bdi>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    );
  else if (view === "security")
    content = (
      <Card>
        <CardHeader>
          <CardTitle>{t("security")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Badge variant="secondary" className="self-start">
            {account(user.email_verified_at ? "emailVerified" : "emailUnverified")}
          </Badge>
          <EmailSettings email={user.email} verified={!!user.email_verified_at} />
        </CardContent>
        <CardFooter>
          <Link href="/forgot-password" className={buttonVariants({ variant: "outline" })}>
            {recovery("forgotTitle")}
          </Link>
        </CardFooter>
      </Card>
    );
  else if (["operations", "trust", "case"].includes(view)) {
    const denied = role.error instanceof ApiError && role.error.status === 403;
    if (roleData && !denied)
      content = (
        <ProtectedSessionContext
          value={{ ...session, authorized: authorized && role.isSuccess && !role.isFetching }}
        >
          <PrivateQueryRegion
            masked={role.isPending || role.isFetching || role.isError}
            error={role.isError ? t("retryAccess") : undefined}
            retry={() => void role.refetch()}
          >
            {view === "operations" ? (
              <VerificationReview userId={user.id} />
            ) : view === "trust" ? (
              <TrustPanel userId={user.id} owner={roleData.owner} />
            ) : businessId ? (
              <ReviewCase userId={user.id} businessId={businessId} />
            ) : null}
          </PrivateQueryRegion>
        </ProtectedSessionContext>
      );
    else if (role.isError)
      content = (
        <>
          <Alert variant="destructive">
            <AlertDescription>{t(denied ? "permission" : "retryAccess")}</AlertDescription>
          </Alert>
          {!denied && <Button onClick={() => void role.refetch()}>{common("retry")}</Button>}
        </>
      );
    else content = <p role="status">{common("loading")}</p>;
  } else if (business.isPending && businessData === undefined)
    content = (
      <div className="grid gap-4" role="status" aria-label={common("loading")}>
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  else if (business.isError && businessData === undefined) content = retryBusiness;
  else if (view === "overview") {
    const state = businessData?.status;
    const next = !state
      ? "createBusiness"
      : state === "draft"
        ? "continueVerification"
        : state === "changes_requested"
          ? "correct"
          : state === "pending"
            ? "waiting"
            : state;
    const href = !state
      ? "/account/business"
      : ["draft", "changes_requested", "pending", "rejected"].includes(state)
        ? "/account/business/verification"
        : state === "suspended"
          ? "/account/access"
          : "/catalog";
    content = (
      <>
        <Card>
          <CardHeader>
            {state && (
              <Badge variant="secondary" className="self-start">
                {b(`statuses.${state}`)}
              </Badge>
            )}
            <CardTitle className="text-2xl">{t(next)}</CardTitle>
            <CardDescription>
              {t(state === "verified" ? "purchaseHint" : "nextAction")}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href={href} className={buttonVariants()}>
              {t(
                !state
                  ? "createBusiness"
                  : state === "verified"
                    ? "explore"
                    : state === "suspended"
                      ? "access"
                      : ["pending", "rejected"].includes(state)
                        ? "verification"
                        : "continueVerification",
              )}
            </Link>
          </CardFooter>
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("businessSummary")}</CardTitle>
            </CardHeader>
            <CardContent>
              {businessData ? (
                <>
                  <p className="font-medium">
                    <bdi>{businessData.name}</bdi>
                  </p>
                  <p className="text-muted-foreground">{b(`kinds.${businessData.kind}`)}</p>
                </>
              ) : (
                <p>{t("noBusiness")}</p>
              )}
            </CardContent>
            <CardFooter>
              <Link href="/account/business" className={buttonVariants({ variant: "outline" })}>
                {t("business")}
              </Link>
            </CardFooter>
          </Card>
          <AccessSummary business={businessData} />
        </div>
      </>
    );
  } else if (!businessData)
    content =
      view === "business" || view === "verification" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("createBusiness")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BusinessForm userId={user.id} onCheck={() => void business.refetch()} />
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertDescription>
            {t("noBusiness")}{" "}
            <Link href="/account/business" className="underline">
              {t("createBusiness")}
            </Link>
          </AlertDescription>
        </Alert>
      );
  else if (view === "access")
    content = (
      <>
        <AccessSummary business={businessData} />
        {["verified", "suspended"].includes(businessData.status) && (
          <AccountHistory userId={user.id} restricted={businessData.status === "suspended"} />
        )}
      </>
    );
  else if (view === "business") {
    const canEdit =
      businessData.status === "draft" ||
      (businessData.status === "changes_requested" &&
        sectionsData?.some((s) => s.kind === "activity" && s.status === "changes_requested"));
    content = (
      <Card>
        <CardHeader>
          <CardTitle>
            <bdi>{businessData.name}</bdi>
          </CardTitle>
          <CardDescription>
            <Badge variant="secondary">{b(`statuses.${businessData.status}`)}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {businessData.status === "draft" && (
            <Alert>
              <AlertDescription>{b("draftNotice")}</AlertDescription>
            </Alert>
          )}
          {businessData.logo && (
            <Image
              src={onboardingUrl("content", businessData.logo)}
              alt={o("logo")}
              width={96}
              height={96}
              unoptimized
              className="rounded-md object-contain"
            />
          )}
          {editing ? (
            <BusinessForm
              userId={user.id}
              initialBusiness={businessData}
              onSaved={() => setEditing(false)}
              onCheck={() => void business.refetch()}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  [b("fields.kind"), b(`kinds.${businessData.kind}`)],
                  [b("fields.phone"), businessData.phone],
                  [b("fields.description"), businessData.description],
                  ...businessData.addresses.map((a) => [
                    b("fields.address.address"),
                    `${a.province}، ${a.city}، ${a.address}`,
                  ]),
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="mt-1">
                    <bdi dir="auto">{value}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3">
          {canEdit && (
            <Button variant="outline" onClick={() => setEditing((v) => !v)}>
              {o(editing ? "cancel" : "editProfile")}
            </Button>
          )}
          <Link
            href={
              businessData.status === "verified"
                ? "/account/business/revisions"
                : "/account/business/verification"
            }
            className={buttonVariants()}
          >
            {t(businessData.status === "verified" ? "revisions" : "verification")}
          </Link>
        </CardFooter>
      </Card>
    );
  } else if (!sectionsData)
    content = sections.isError ? (
      <>
        <Alert variant="destructive">
          <AlertDescription>{o("loadError")}</AlertDescription>
        </Alert>
        <Button onClick={() => void sections.refetch()}>{common("retry")}</Button>
      </>
    ) : (
      <p role="status">{common("loading")}</p>
    );
  else if (view === "verification")
    content = (
      <BusinessWizard
        userId={user.id}
        business={businessData}
        sections={sectionsData}
        onCheck={() => void business.refetch()}
      />
    );
  else if (view === "revisions")
    content = ["verified", "suspended"].includes(businessData.status) ? (
      <Card>
        <CardContent>
          <BusinessRevisions userId={user.id} business={businessData} sections={sectionsData} />
        </CardContent>
      </Card>
    ) : (
      <Alert>
        <AlertDescription>{t("permission")}</AlertDescription>
      </Alert>
    );
  else if (view === "documents")
    content = (
      <>
        <Alert>
          <AlertDescription>{t("retentionHint")}</AlertDescription>
        </Alert>
        {sectionsData.map((section) => {
          const identity = identitySchema.safeParse(section.data);
          const activity = activitySchema.safeParse(section.data);
          const files =
            section.kind === "identity" && identity.success
              ? [identity.data.card_front, identity.data.card_back, identity.data.selfie]
              : section.kind === "activity" && activity.success
                ? activity.data.files
                : [];
          return (
            <Card key={section.kind}>
              <CardHeader>
                <CardTitle>{o(section.kind)}</CardTitle>
                <CardDescription>{o(`statuses.${section.status}`)}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {files.length ? (
                  files.map((id, index) => (
                    <a
                      key={id}
                      href={onboardingUrl("content", id)}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "outline" })}
                    >
                      {o("viewFile", { number: index + 1 })}
                    </a>
                  ))
                ) : (
                  <p>{t("noDocuments")}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </>
    );
  return (
    <>
      {title}
      <PrivateQueryRegion
        masked={
          needsBusiness &&
          (business.isFetching || business.isError || sections.isFetching || sections.isError)
        }
        error={business.isError ? b("loadError") : sections.isError ? o("loadError") : undefined}
        retry={() => {
          if (business.isError) void business.refetch();
          else void sections.refetch();
        }}
      >
        {content}
      </PrivateQueryRegion>
      {view === "overview" && <Link href="/">{common("backHome")}</Link>}
    </>
  );
}

import type { z } from "zod";
import type { businessSchema } from "../../schemas/business.schema";
function AccessSummary({
  business,
}: {
  business: z.infer<typeof businessSchema> | null | undefined;
}) {
  const t = useTranslations("accounts.workspace");
  const price = business?.kind === "retailer" && business.status === "verified";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("access")}</CardTitle>
        <CardDescription>{t("accessHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid gap-4">
          <div className="flex flex-wrap justify-between gap-2">
            <dt>{t("priceAccess")}</dt>
            <dd>
              <Badge variant="secondary">{t(price ? "allowed" : "notAllowed")}</Badge>
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt>{t("controlledAccess")}</dt>
            <dd>{t(business?.controlled_access ? "enabled" : "notEnabled")}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">{t("purchaseHint")}</p>
      </CardContent>
    </Card>
  );
}
