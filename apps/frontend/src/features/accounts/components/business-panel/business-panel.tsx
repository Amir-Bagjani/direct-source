"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card/card";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { businessOptions } from "../../queries/business.queries";
import { BusinessOnboarding } from "../business-onboarding/business-onboarding";
import { BusinessForm } from "../business-form/business-form";
import type { BusinessPanelProps } from "./business-panel.types";
export function BusinessPanel({ userId }: BusinessPanelProps) {
  const t = useTranslations("accounts.business");
  const common = useTranslations("common");
  const query = useQuery(businessOptions(userId));
  const business = query.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <p role="status" className="flex items-center gap-2">
            <Spinner aria-hidden="true" />
            {common("loading")}
          </p>
        ) : query.isError ? (
          <div className="flex flex-col gap-4">
            <Alert variant="destructive">
              <AlertDescription>{t("loadError")}</AlertDescription>
            </Alert>
            <Button onClick={() => void query.refetch()}>{common("retry")}</Button>
          </div>
        ) : business ? (
          <div className="flex flex-col gap-4">
            <p>
              {t("status")}: {t(`statuses.${business.status}`)}
            </p>
            <dl className="grid gap-2">
              <dt>{t("fields.name")}</dt>
              <dd>
                <bdi>{business.name}</bdi>
              </dd>
              <dt>{t("fields.kind")}</dt>
              <dd>{t(`kinds.${business.kind}`)}</dd>
              <dt>{t("fields.phone")}</dt>
              <dd>
                <bdi dir="ltr">{business.phone}</bdi>
              </dd>
              <dt>{t("fields.description")}</dt>
              <dd>
                <bdi>{business.description}</bdi>
              </dd>
              {business.addresses.map((address) => (
                <div key={address.id} className="grid gap-2">
                  <dt>{t("fields.address.province")}</dt>
                  <dd>
                    <bdi>{address.province}</bdi>
                  </dd>
                  <dt>{t("fields.address.city")}</dt>
                  <dd>
                    <bdi>{address.city}</bdi>
                  </dd>
                  <dt>{t("fields.address.address")}</dt>
                  <dd>
                    <bdi>{address.address}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
            <BusinessOnboarding userId={userId} business={business} />
            {business.status === "draft" && (
              <Alert>
                <AlertDescription>{t("draftNotice")}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <BusinessForm userId={userId} onCheck={() => void query.refetch()} />
        )}
      </CardContent>
    </Card>
  );
}
