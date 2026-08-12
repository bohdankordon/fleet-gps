import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, AuthRole } from "./generated/prisma/client";
import { AuthUserCreateError, createAuthUser } from "./modules/auth/auth-user-create";
import { isPermission, PERMISSIONS } from "./modules/auth/permissions";

async function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") throw new AuthUserCreateError("A secure interactive TTY is required for hidden password input.");
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error): void => {
      stdin.off("data", onData); stdin.setRawMode(false); stdin.pause(); stdout.write("\n");
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk: string): void => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u0003") return finish(new AuthUserCreateError("Cancelled."));
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new AuthUserCreateError("This command does not accept arguments; passwords must never be supplied via argv.");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new AuthUserCreateError("DATABASE_URL is required.");
  if (!stdin.isTTY || !stdout.isTTY) throw new AuthUserCreateError("An interactive TTY is required.");
  const terminal = createInterface({ input: stdin, output: stdout });
  const login = await terminal.question("Login: ");
  const rawRole = (await terminal.question("Role (ADMIN/USER): ")).toUpperCase();
  if (rawRole !== AuthRole.ADMIN && rawRole !== AuthRole.USER) { terminal.close(); throw new AuthUserCreateError("Role must be ADMIN or USER."); }
  let permissions: string[] = [];
  if (rawRole === AuthRole.USER) {
    stdout.write(`Available permissions: ${PERMISSIONS.join(", ")}\n`);
    const raw = await terminal.question("Permissions (comma-separated, blank for none): ");
    permissions = raw === "" ? [] : raw.split(",").map((value) => value.trim());
    if (permissions.some((value) => !isPermission(value))) { terminal.close(); throw new AuthUserCreateError("One or more permission keys are unknown."); }
  }
  terminal.close();
  const password = await readHidden("Password: ");
  const confirmation = await readHidden("Confirm password: ");
  if (password !== confirmation) throw new AuthUserCreateError("Passwords do not match.");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const created = await createAuthUser(client, { login, role: rawRole, permissions, password });
    stdout.write(`Created ${created.role} account ${created.login}${created.permissions.length ? ` with permissions: ${created.permissions.join(", ")}` : ""}.\n`);
  } finally { await client.$disconnect(); }
}

void main().catch((error: unknown) => { const message = error instanceof AuthUserCreateError ? error.message : "Unable to create account."; process.stderr.write(`${message}\n`); process.exitCode = 1; });
