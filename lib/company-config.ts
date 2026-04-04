import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CompanyThemeConfig, ManagerAccount } from "@/lib/types";

const dataDir = path.join(process.cwd(), "data");
const themesPath = path.join(dataDir, "company-themes.json");
const accountsPath = path.join(dataDir, "manager-accounts.json");

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function writeJsonFile<T>(filePath: string, value: T) {
  await ensureDataDir();
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function getCompanyThemes() {
  return readJsonFile<CompanyThemeConfig[]>(themesPath);
}

export async function getCompanyTheme(companyId: string) {
  const themes = await getCompanyThemes();
  return themes.find((item) => item.id === companyId);
}

export async function updateCompanyTheme(
  companyId: string,
  updater: (theme: CompanyThemeConfig) => CompanyThemeConfig
) {
  const themes = await getCompanyThemes();
  const nextThemes = themes.map((theme) => (theme.id === companyId ? updater(theme) : theme));
  await writeJsonFile(themesPath, nextThemes);
  return nextThemes.find((theme) => theme.id === companyId) || null;
}

export async function getManagerAccounts() {
  return readJsonFile<ManagerAccount[]>(accountsPath);
}

export async function getManagerAccount(username: string, password: string) {
  const accounts = await getManagerAccounts();
  return accounts.find(
    (item) => item.username === username.trim() && item.password === password
  );
}

export async function getManagerById(managerId: string) {
  const accounts = await getManagerAccounts();
  return accounts.find((item) => item.id === managerId);
}

export async function getManagersByCompany(companyId: string) {
  const accounts = await getManagerAccounts();
  return accounts.filter((item) => item.companyId === companyId);
}

export async function createManagerAccount(account: ManagerAccount) {
  const accounts = await getManagerAccounts();
  const nextAccounts = [...accounts, account];
  await writeJsonFile(accountsPath, nextAccounts);
  return account;
}
