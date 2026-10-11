"use client";
import { useProtectedSession } from "../protected-session-boundary/protected-session-context";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useFormatter } from "next-intl";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { trustOptions } from "../../queries/trust.queries";
import {
  orderHistorySchema,
  ticketPageSchema,
  suspensionPageSchema,
} from "../../schemas/trust.schema";
import { SupportReply } from "../support-reply/support-reply";
import type { AccountHistoryProps } from "./account-history.types";
export function AccountHistory({ userId, restricted }: AccountHistoryProps) {
  const { authorized } = useProtectedSession();
  const t = useTranslations("accounts.trust");
  const format = useFormatter();
  const [orderPage, setOrderPage] = useState(1);
  const [ticketPage, setTicketPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [ticket, setTicket] = useState("");
  const orders = useQuery({
    ...trustOptions(userId, "orders", orderHistorySchema, "", orderPage),
    enabled: authorized,
  });
  const tickets = useQuery({
    ...trustOptions(userId, "tickets", ticketPageSchema, "", ticketPage),
    enabled: authorized,
  });
  const history = useQuery({
    ...trustOptions(userId, "own-suspensions", suspensionPageSchema, "", historyPage),
    enabled: authorized,
  });
  return (
    <section className="flex flex-col gap-4">
      {restricted && (
        <Alert>
          <AlertDescription>{t("restricted")}</AlertDescription>
        </Alert>
      )}
      <h3>{t("history")}</h3>
      {history.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : history.isError ? (
        <Button onClick={() => void history.refetch()}>{t("retry")}</Button>
      ) : (
        <>
          {history.data.results.map((row) => (
            <p key={row.id} dir="auto">
              {t(`statuses.${row.status}`)} · {row.reason}
            </p>
          ))}
          <div className="flex gap-2">
            <Button disabled={historyPage === 1} onClick={() => setHistoryPage((p) => p - 1)}>
              {t("previous")}
            </Button>
            <Button
              disabled={historyPage * 25 >= history.data.count}
              onClick={() => setHistoryPage((p) => p + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </>
      )}
      <h3>{t("orders")}</h3>
      {orders.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : orders.isError ? (
        <Button onClick={() => void orders.refetch()}>{t("retry")}</Button>
      ) : (
        <>
          {!orders.data.results.length && <p>{t("empty")}</p>}
          {orders.data.results.map((row) => (
            <div key={row.id} className="flex flex-col gap-2">
              <p>
                {t("reference")}: <bdi>{row.id}</bdi> · {t(`statuses.${row.status}`)}
              </p>
              {row.commercial.goods_total_irr !== undefined && (
                <p>
                  {t("amount")}: {format.number(row.commercial.goods_total_irr)}
                </p>
              )}
              <p dir="auto">{row.decision_reason}</p>
              {row.lines.map((line, i) => (
                <p key={`${line.sku}:${i}`}>
                  <bdi>{line.sku}</bdi> × {format.number(line.quantity)}
                </p>
              ))}
            </div>
          ))}
          <div className="flex gap-2">
            <Button disabled={orderPage === 1} onClick={() => setOrderPage((p) => p - 1)}>
              {t("previous")}
            </Button>
            <Button
              disabled={orderPage * 25 >= orders.data.count}
              onClick={() => setOrderPage((p) => p + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </>
      )}
      <h3>{t("tickets")}</h3>
      {tickets.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : tickets.isError ? (
        <Button onClick={() => void tickets.refetch()}>{t("retry")}</Button>
      ) : (
        <>
          {!tickets.data.results.length && <p>{t("empty")}</p>}
          {tickets.data.results.map((row) => (
            <div key={row.id} className="flex flex-wrap gap-2">
              <p dir="auto">
                {row.number} · {row.title} · {t(`statuses.${row.status}`)}
              </p>
              <Button onClick={() => setTicket(row.id)}>{t("open")}</Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button disabled={ticketPage === 1} onClick={() => setTicketPage((p) => p - 1)}>
              {t("previous")}
            </Button>
            <Button
              disabled={ticketPage * 25 >= tickets.data.count}
              onClick={() => setTicketPage((p) => p + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </>
      )}
      {ticket && <SupportReply key={ticket} userId={userId} ticketId={ticket} />}
    </section>
  );
}
