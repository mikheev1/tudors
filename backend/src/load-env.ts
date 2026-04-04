import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function applyEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadBackendEnv() {
  const backendRoot = path.resolve(process.cwd());
  const projectRoot = path.resolve(backendRoot, "..");

  applyEnvFile(path.join(projectRoot, ".env"));
  applyEnvFile(path.join(projectRoot, ".env.local"));
  applyEnvFile(path.join(backendRoot, ".env"));
  applyEnvFile(path.join(backendRoot, ".env.local"));
}
