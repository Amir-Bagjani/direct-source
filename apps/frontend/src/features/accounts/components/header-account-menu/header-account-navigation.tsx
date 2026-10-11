import { headers } from "next/headers";
import { sessionId } from "../../server/session-cookie.server";
import { HeaderAccountMenu } from "./header-account-menu";
export async function HeaderAccountNavigation() {
  const present = !!(await sessionId((await headers()).get("cookie")));
  return <HeaderAccountMenu sessionPresent={present} />;
}
