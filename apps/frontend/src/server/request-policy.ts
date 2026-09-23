export function isSameOriginMutation(request: Request, trustedOrigin: string) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  return (
    request.headers.get("origin") === trustedOrigin &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}
