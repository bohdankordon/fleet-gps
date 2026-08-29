async function main(): Promise<void> {
  try {
    const { parseApiConfig } = await import("../config/api-config");
    parseApiConfig({ ...process.env, NODE_ENV: "production" });
    process.stdout.write("production API configuration valid: true\n");
  } catch (error) {
    const fields = typeof error === "object" && error !== null && "name" in error && error.name === "ApiConfigurationError" && "issues" in error && Array.isArray(error.issues) ? error.issues : [];
    const suffix = fields.length > 0 ? `; invalid fields: ${[...new Set(fields)].sort().join(",")}` : "";
    process.stderr.write(`production API configuration valid: false${suffix}\n`);
    process.exitCode = 1;
  }
}

void main();
