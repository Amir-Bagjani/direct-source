import { onboardingBff } from "@/features/accounts/server/onboarding.server";
async function handle(
  request: Request,
  context: RouteContext<"/api/bff/accounts/onboarding/[action]">,
) {
  return onboardingBff(request, (await context.params).action);
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
