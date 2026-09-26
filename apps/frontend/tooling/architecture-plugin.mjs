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
      meta: {
        schema: [],
        messages: {
          boundary: "{{from}} cannot depend on {{to}}.",
          internal: "Cross-feature imports must target an intentional contracts/ module.",
          client: "Client modules cannot import server-only implementations.",
        },
      },
      create(context) {
        const root = resolve(context.cwd, "src");
        const layer = (path) => relative(root, path).split(sep)[0];
        const from = layer(context.filename);
        const parts = relative(root, context.filename).split(sep);
        let client = false;
        function check(node) {
          const specifier = node?.value;
          if (typeof specifier !== "string") return;
          const target = specifier.startsWith("@/")
            ? resolve(root, specifier.slice(2))
            : specifier.startsWith(".") || isAbsolute(specifier)
              ? resolve(dirname(context.filename), specifier)
              : null;
          const to = target && layer(target);
          const targetParts = target && relative(root, target).split(sep);
          if (
            from === "features" &&
            to === "features" &&
            parts[1] !== targetParts[1] &&
            targetParts[2] !== "contracts"
          )
            context.report({ node, messageId: "internal" });
          if (
            client &&
            (specifier === "server-only" ||
              to === "server" ||
              targetParts?.[2] === "server" ||
              /\.server(?:\.[cm]?[jt]sx?)?$/.test(specifier))
          )
            context.report({ node, messageId: "client" });
          if (forbidden[from]?.includes(to)) {
            context.report({ node, messageId: "boundary", data: { from, to } });
          }
        }
        return {
          Program(node) {
            client = node.body.some(
              (statement) =>
                statement.type === "ExpressionStatement" &&
                statement.expression.value === "use client",
            );
          },
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
    "feature-layout": {
      meta: {
        schema: [],
        messages: {
          root: "Place feature source in its responsibility directory; see feature-module-design.",
          key: "Use the feature query key factory, not an inline array.",
        },
      },
      create(context) {
        const parts = relative(resolve(context.cwd, "src/features"), context.filename).split(sep);
        const feature = parts.length >= 2 && !parts[0].startsWith("..");
        return {
          Program(node) {
            if (feature && parts.length === 2) context.report({ node, messageId: "root" });
          },
          Property(node) {
            if (
              feature &&
              !/\.test\./.test(context.filename) &&
              ["queryKey", "mutationKey"].includes(node.key.name ?? node.key.value) &&
              node.value.type === "ArrayExpression"
            )
              context.report({ node, messageId: "key" });
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
