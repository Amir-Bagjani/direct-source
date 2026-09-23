// CI uses explicit checks, and production installs do not include dev dependencies.
if (process.env.CI || process.env.NODE_ENV === "production" || process.env.HUSKY === "0") {
  process.exit(0);
}

const { default: husky } = await import("husky");
// pnpm runs lifecycle scripts from apps/frontend; Git lives two levels above it.
process.chdir("../..");
const message = husky("apps/frontend/.husky");
if (message) console.log(message);
