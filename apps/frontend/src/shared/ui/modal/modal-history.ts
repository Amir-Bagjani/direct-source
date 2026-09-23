const marker = "directsourcingModal";

export function withoutModal(url: URL) {
  const base = new URL(url);
  base.searchParams.delete("modal");
  base.searchParams.delete("id");
  return base;
}

export function openModal(name: string, id?: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("modal", name);
  if (id) url.searchParams.set("id", id);
  else url.searchParams.delete("id");
  if (url.href === window.location.href) return;
  // Next patches replaceState and copies its internal fields itself. Passing __NA
  // from history.state makes Next skip syncing useSearchParams.
  // Modal creates a separate Back entry only when its closeOnBack prop is true.
  // Preserve an existing modal entry when updating its id/content while it is open.
  history.replaceState({ [marker]: history.state?.[marker] }, "", url);
}

export function prepareModalHistory() {
  // A directly opened URL needs a same-page Back destination as well.
  if (history.state?.[marker] === window.location.pathname) return;
  const url = new URL(window.location.href);
  history.replaceState({}, "", withoutModal(url));
  history.pushState({ [marker]: url.pathname }, "", url);
}

export function closeModal() {
  if (history.state?.[marker] === window.location.pathname) history.back();
  else history.replaceState({}, "", withoutModal(new URL(window.location.href)));
}
