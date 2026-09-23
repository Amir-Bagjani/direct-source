import ts from "typescript";

// tsc does not fail on editor-only deprecation suggestions. Use the installed
// language service so the same diagnostics become a CI check, without another linter.
const configFile = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
if (configFile.error)
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
if (config.errors.length)
  throw new Error(
    ts.formatDiagnostics(config.errors, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }),
  );
const service = ts.createLanguageService({
  getScriptFileNames: () => config.fileNames,
  getScriptVersion: () => "0",
  getScriptSnapshot(path) {
    const source = ts.sys.readFile(path);
    return source === undefined ? undefined : ts.ScriptSnapshot.fromString(source);
  },
  getCurrentDirectory: () => process.cwd(),
  getCompilationSettings: () => config.options,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
});
const files = config.fileNames.filter(
  (file) =>
    !file.includes("/.next/") &&
    !file.endsWith("/next-env.d.ts") &&
    !file.endsWith("/src/shared/api/openapi.ts"),
);
let count = 0;
for (const file of files) {
  for (const diagnostic of service.getSuggestionDiagnostics(file)) {
    if (!diagnostic.reportsDeprecated) continue;
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    console.error(
      `${file}:${position.line + 1}:${position.character + 1} TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
    );
    count++;
  }
}
service.dispose();
console.log(`Deprecated API diagnostics: ${count} (${files.length} project files checked).`);
process.exitCode = count ? 1 : 0;
