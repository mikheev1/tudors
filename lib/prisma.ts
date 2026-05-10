import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | null | undefined;
}

const databaseUrl = process.env.DATABASE_URL?.trim();

export const isDatabaseConfigured = Boolean(databaseUrl);

export const prisma = isDatabaseConfigured
  ? global.prisma ||
    new PrismaClient({
      log: ["warn", "error"]
    })
  : null;

if (process.env.NODE_ENV !== "production" && prisma) {
  global.prisma = prisma;
}

export function getDatabaseUnavailableError() {
  return new Error("DATABASE_URL is not configured. Add it to .env or .env.local to enable database features.");
}
