import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const forbidden = {
  shared: ["app", "features", "server"],
  i18n: ["app", "features", "server"],
  server: ["app", "features"],
  features: ["app"],
};

// ponytail: only the project's @/ alias and relative/absolute paths are supported.
// Update this rule and its integration test if tsconfig gains another local alias.
export default {
  meta: { name: "architecture" },
  rules: {
    dependencies: {
      meta: { schema: [], messages: { boundary: "{{from}} cannot depend on {{to}}." } },
      create(context) {
        const root = resolve(context.cwd, "src");
        const layer = (path) => relative(root, path).split(sep)[0];
        const from = layer(context.filename);
        function check(node) {
          const specifier = node?.value;
          if (typeof specifier !== "string") return;
          const target = specifier.startsWith("@/")
            ? resolve(root, specifier.slice(2))
            : specifier.startsWith(".") || isAbsolute(specifier)
              ? resolve(dirname(context.filename), specifier)
              : null;
          const to = target && layer(target);
          if (forbidden[from]?.includes(to)) {
            context.report({ node, messageId: "boundary", data: { from, to } });
          }
        }
        return {
          ImportDeclaration: (node) => check(node.source),
          ImportExpression: (node) => check(node.source),
          TSImportType: (node) => check(node.source),
          TSExternalModuleReference: (node) => check(node.expression),
          CallExpression(node) {
            if (node.callee.type === "Identifier" && node.callee.name === "require")
              check(node.arguments[0]);
          },
        };
      },
    },
    "no-reexports": {
      meta: {
        schema: [],
        messages: { barrel: "No re-export barrels; import the source file directly." },
      },
      create(context) {
        const report = (node) => context.report({ node, messageId: "barrel" });
        return {
          ExportAllDeclaration: report,
          ExportNamedDeclaration(node) {
            if (node.source) report(node);
          },
        };
      },
    },
  },
};
