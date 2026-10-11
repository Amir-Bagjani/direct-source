import { z } from "zod";
import { notFound } from "next/navigation";
import { AccountScreen } from "@/features/accounts/components/account-screen/account-screen";
export default async function Page({
  params,
}: PageProps<"/[locale]/account/operations/businesses/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <AccountScreen view="case" businessId={id} />;
}
