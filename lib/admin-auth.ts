import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { getManagerById } from "@/lib/company-config";

const COOKIE_NAME = "tb_admin_session";
const AUTH_SECRET = process.env.ADMIN_AUTH_SECRET || "local-demo-secret";

type SessionPayload = {
  managerId: string;
  companyId: string;
};

function toBase64(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", AUTH_SECRET).update(value).digest("hex");
}

export function createAdminSession(payload: SessionPayload) {
  const encoded = toBase64(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

function parseAdminSession(token?: string | null): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(fromBase64(encoded)) as SessionPayload;
  } catch {
    return null;
  }
}

export async function setAdminSessionCookie(token: string) {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = parseAdminSession(token);

  if (!payload) {
    return null;
  }

  const manager = await getManagerById(payload.managerId);
  if (!manager || (manager.role !== "superadmin" && manager.companyId !== payload.companyId)) {
    return null;
  }

  return {
    managerId: manager.id,
    fullName: manager.fullName,
    username: manager.username,
    companyId: manager.companyId,
    role: manager.role
  };
}
