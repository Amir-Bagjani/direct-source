"use client";
import { useRetainedQueryData } from "@/shared/hooks/use-retained-query-data";
import { PrivateQueryRegion } from "@/shared/ui/private-query-region/private-query-region";
import { useProtectedSession } from "../protected-session-boundary/protected-session-context";
import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/shared/ui/field/field";
import { Textarea } from "@/shared/ui/textarea/textarea";
import { DocumentUpload } from "../document-upload/document-upload";
import { trustOptions } from "../../queries/trust.queries";
import { ticketSchema, ticketReplySchema } from "../../schemas/trust.schema";
import { onboardingUrl } from "../../api/onboarding.api";
import { writeTrust } from "../../api/trust.api";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import type { SupportReplyProps } from "./support-reply.types";
export function SupportReply({ userId, ticketId }: SupportReplyProps) {
  const { authorized } = useProtectedSession();
  const t = useTranslations("accounts.trust");
  const format = useFormatter();
  const id = useId();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const attempt = useRef({ body: "", key: "" });
  const query = useQuery({
    ...trustOptions(userId, "ticket", ticketSchema, ticketId),
    enabled: authorized,
  });
  const data = useRetainedQueryData(
    query,
    trustOptions(userId, "ticket", ticketSchema, ticketId).queryKey,
  );
  const mutation = useOnboardingMutation(userId, () => {
    const signature = JSON.stringify({ text, files });
    if (signature !== attempt.current.body)
      attempt.current = { body: signature, key: crypto.randomUUID() };
    return writeTrust(
      "ticket-reply",
      ticketId,
      ticketReplySchema.parse({ text, files, idempotency_key: attempt.current.key }),
    );
  });
  if (query.isPending && !data) return <p role="status">{t("loading")}</p>;
  if (query.isError && !data)
    return <Button onClick={() => void query.refetch()}>{t("retry")}</Button>;
  if (!data) return null;
  return (
    <PrivateQueryRegion
      masked={query.isPending || query.isError}
      error={query.isError ? t("error") : undefined}
      retry={() => void query.refetch()}
    >
      <section className="flex flex-col gap-4">
        <h4 dir="auto">{data.title}</h4>
        {data.messages.map((message) => (
          <div key={message.id} className="flex flex-col gap-2">
            <p dir="auto">{message.text}</p>
            <p>
              {format.dateTime(new Date(message.created_at), {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              })}
            </p>
            {message.files.map((file) => (
              <a key={file} href={onboardingUrl("content", file)} target="_blank" rel="noreferrer">
                {t("evidence")} · <bdi>{file}</bdi>
              </a>
            ))}
          </div>
        ))}
        {data.status !== "closed" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate(undefined, {
                onSuccess: () => {
                  setText("");
                  setFiles([]);
                  attempt.current = { body: "", key: "" };
                },
              });
            }}
          >
            <FieldSet disabled={mutation.isPending}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={id}>{t("message")}</FieldLabel>
                  <Textarea
                    id={id}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    required
                    maxLength={8000}
                  />
                </Field>
                <DocumentUpload
                  targetId={ticketId}
                  purpose="support"
                  value={files}
                  onChange={setFiles}
                  label={t("evidence")}
                  max={10}
                />
                <Button type="submit" disabled={mutation.isPending}>
                  {t("reply")}
                </Button>
                {mutation.isError && <p role="alert">{t("error")}</p>}
                {mutation.isSuccess && <p role="status">{t("completed")}</p>}
              </FieldGroup>
            </FieldSet>
          </form>
        )}
      </section>
    </PrivateQueryRegion>
  );
}
