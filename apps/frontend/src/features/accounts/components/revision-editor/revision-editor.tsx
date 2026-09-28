"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/shared/ui/checkbox/checkbox";
import { Button } from "@/shared/ui/button/button";
import { Field, FieldLabel } from "@/shared/ui/field/field";
import { BusinessForm } from "../business-form/business-form";
import { VerificationSectionForm } from "../verification-section/verification-section";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { revisionChangesSchema } from "../../schemas/trust.schema";
import type { RevisionChanges } from "../../schemas/trust.schema";
import { identitySchema, activitySchema } from "../../schemas/onboarding.schema";
import { writeTrust } from "../../api/trust.api";
import type { RevisionEditorProps } from "./revision-editor.types";
export function RevisionEditor({ userId, business, revision, sections }: RevisionEditorProps) {
  const t = useTranslations("accounts.trust");
  const [selected, setSelected] = useState<string[]>([]);
  const [changes, setChanges] = useState<Partial<RevisionChanges>>({});
  const mutation = useOnboardingMutation(userId, () =>
    writeTrust(
      revision ? "revision-update" : "revision-create",
      revision?.id ?? business.id,
      revisionChangesSchema.parse(changes),
    ),
  );
  const profile = revision?.proposed.profile;
  const initial = profile
    ? {
        ...business,
        ...profile,
        logo: profile.logo ?? null,
        addresses: business.addresses.map((a, i) => (i === 0 ? { ...a, ...profile.address } : a)),
      }
    : business;
  return (
    <div className="flex flex-col gap-4">
      <p>{t("revisionHint")}</p>
      {(["profile", "identity", "activity"] as const)
        .filter(
          (kind) =>
            !revision ||
            revision[kind === "identity" ? "identity_status" : "activity_status"] ===
              "changes_requested",
        )
        .map((kind) => (
          <div key={kind} className="flex flex-col gap-4">
            <Field orientation="horizontal">
              <Checkbox
                id={`revision-${kind}`}
                checked={selected.includes(kind)}
                onCheckedChange={(checked) => {
                  setSelected((old) => (checked ? [...old, kind] : old.filter((k) => k !== kind)));
                  setChanges((old) => {
                    const next = { ...old };
                    delete next[kind];
                    return next;
                  });
                }}
              />
              <FieldLabel htmlFor={`revision-${kind}`}>{t(kind)}</FieldLabel>
            </Field>
            {selected.includes(kind) &&
              (kind === "profile" ? (
                <BusinessForm
                  userId={userId}
                  initialBusiness={initial}
                  onCheck={() => {}}
                  prepareRevision={async (input) => {
                    setChanges((old) => ({ ...old, profile: input }));
                  }}
                />
              ) : (
                <VerificationSectionForm
                  userId={userId}
                  businessId={business.id}
                  editable
                  section={{
                    kind,
                    status: "draft",
                    reason: "",
                    data: revision
                      ? revision.proposed[kind]
                      : (sections.find((s) => s.kind === kind)?.data ?? {}),
                  }}
                  prepareRevision={async (data) => {
                    setChanges((old) =>
                      kind === "identity"
                        ? { ...old, identity: identitySchema.parse(data) }
                        : { ...old, activity: activitySchema.parse(data) },
                    );
                  }}
                />
              ))}
            {changes[kind] && <p role="status">{t("prepared")}</p>}
          </div>
        ))}
      <Button
        disabled={
          mutation.isPending || !selected.length || selected.some((k) => !Object.hasOwn(changes, k))
        }
        onClick={() => mutation.mutate()}
      >
        {t("submitRevision")}
      </Button>
      {mutation.isError && <p role="alert">{t("error")}</p>}
    </div>
  );
}
