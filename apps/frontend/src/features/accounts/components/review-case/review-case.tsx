"use client";
import { useRetainedQueryData } from "../../hooks/use-retained-query-data";
import { PrivateQueryRegion } from "../private-query-region/private-query-region";
import { useProtectedSession } from "../protected-session-boundary/protected-session-context";
import { SuspensionProposal } from "../suspension-proposal/suspension-proposal";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, FieldLabel, FieldGroup, FieldSet } from "@/shared/ui/field/field";
import { Textarea } from "@/shared/ui/textarea/textarea";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/ui/card/card";
import { Badge } from "@/shared/ui/badge/badge";
import { Button } from "@/shared/ui/button/button";
import { sectionsOptions, businessDetailOptions } from "../../queries/onboarding.queries";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeOnboarding, onboardingUrl } from "../../api/onboarding.api";
import { reviewSchema, reasonSchema } from "../../schemas/onboarding.schema";
import { VerificationSectionForm } from "../verification-section/verification-section";
import type { ReviewCaseProps } from "./review-case.types";
export function ReviewCase({ userId, businessId }: ReviewCaseProps) {
  const { authorized } = useProtectedSession();
  const t = useTranslations("accounts.onboarding");
  const b = useTranslations("accounts.business");
  const sections = useQuery({ ...sectionsOptions(userId, businessId), enabled: authorized });
  const business = useQuery({ ...businessDetailOptions(userId, businessId), enabled: authorized });
  const sectionsData = useRetainedQueryData(sections, sectionsOptions(userId, businessId).queryKey);
  const businessData = useRetainedQueryData(
    business,
    businessDetailOptions(userId, businessId).queryKey,
  );
  const [kind, setKind] = useState("identity");
  const [decision, setDecision] = useState("approved");
  const [reason, setReason] = useState("");
  const mutation = useOnboardingMutation(userId, () =>
    businessData?.status === "rejected"
      ? writeOnboarding("reopen", businessId, reasonSchema.parse({ reason }))
      : writeOnboarding("review", businessId, reviewSchema.parse({ kind, decision, reason })),
  );
  if (!sectionsData || !businessData)
    return (
      <PrivateQueryRegion
        masked
        error={sections.isError || business.isError ? t("loadError") : undefined}
        retry={() => {
          void sections.refetch();
          void business.refetch();
        }}
      >
        <p role="status">{t("loading")}</p>
      </PrivateQueryRegion>
    );
  return (
    <PrivateQueryRegion
      masked={sections.isFetching || business.isFetching || sections.isError || business.isError}
      error={sections.isError || business.isError ? t("loadError") : undefined}
      retry={() => {
        void sections.refetch();
        void business.refetch();
      }}
    >
      <section className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>
                <bdi>{businessData.name}</bdi>
              </h2>
            </CardTitle>
            <CardDescription>
              <Badge variant="secondary">{b(`statuses.${businessData.status}`)}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {businessData.logo && (
              <Image
                src={onboardingUrl("content", businessData.logo)}
                alt={t("logo")}
                width={96}
                height={96}
                unoptimized
                className="rounded-md object-contain"
              />
            )}
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">{b("fields.kind")}</dt>
                <dd>
                  <bdi>{b(`kinds.${businessData.kind}`)}</bdi>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{b("fields.phone")}</dt>
                <dd>
                  <bdi dir="ltr">{businessData.phone}</bdi>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">{b("fields.description")}</dt>
                <dd>
                  <bdi>{businessData.description}</bdi>
                </dd>
              </div>
              {businessData.addresses.map((address) => (
                <div key={address.id} className="sm:col-span-2">
                  <dt className="text-sm text-muted-foreground">{b("fields.address.address")}</dt>
                  <dd>
                    <bdi>
                      {address.province}، {address.city}، {address.address}
                    </bdi>
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        {sectionsData.map((section) => (
          <Card key={`${businessId}:${section.kind}:${section.status}`}>
            <CardContent>
              <VerificationSectionForm
                userId={userId}
                businessId={businessId}
                section={section}
                editable={false}
              />
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>{t("decision")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(undefined, { onSuccess: () => setReason("") });
              }}
            >
              <FieldSet disabled={mutation.isPending}>
                <FieldGroup>
                  {businessData.status !== "rejected" && (
                    <>
                      <Field>
                        <FieldLabel htmlFor="review-kind">{t("section")}</FieldLabel>
                        <NativeSelect
                          id="review-kind"
                          value={kind}
                          onChange={(e) => setKind(e.target.value)}
                        >
                          <NativeSelectOption value="identity">{t("identity")}</NativeSelectOption>
                          <NativeSelectOption value="activity">{t("activity")}</NativeSelectOption>
                        </NativeSelect>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="review-decision">{t("decision")}</FieldLabel>
                        <NativeSelect
                          id="review-decision"
                          value={decision}
                          onChange={(e) => setDecision(e.target.value)}
                        >
                          {(["approved", "changes_requested", "rejected"] as const).map((value) => (
                            <NativeSelectOption key={value} value={value}>
                              {t(`statuses.${value}`)}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                    </>
                  )}
                  <Field>
                    <FieldLabel htmlFor="review-reason">{t("reason")}</FieldLabel>
                    <Textarea
                      id="review-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                      maxLength={2000}
                    />
                  </Field>
                  <Button
                    type="submit"
                    disabled={
                      mutation.isPending ||
                      (businessData.status !== "rejected" &&
                        !sectionsData.some((s) => s.kind === kind && s.status === "pending"))
                    }
                  >
                    {t(businessData.status === "rejected" ? "reopen" : "review")}
                  </Button>
                  {mutation.isError && <p role="alert">{t("saveError")}</p>}
                  {mutation.isSuccess && <p role="status">{t("saved")}</p>}
                </FieldGroup>
              </FieldSet>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <SuspensionProposal userId={userId} businessId={businessId} />
          </CardContent>
        </Card>
      </section>
    </PrivateQueryRegion>
  );
}
