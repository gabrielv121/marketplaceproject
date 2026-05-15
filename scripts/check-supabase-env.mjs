#!/usr/bin/env node
import { readFile } from "node:fs/promises";

async function loadEnv(file) {
  const env = {};
  const raw = await readFile(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, index)] = value;
  }
  return env;
}

function decodeJwtPayload(jwt) {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

const env = await loadEnv(".env.local");
const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "";
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const urlRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;
const payload = decodeJwtPayload(key);
const jwtProjectRef = payload?.ref ?? payload?.iss?.split("/").pop() ?? null;

console.log(
  JSON.stringify(
    {
      hasSupabaseUrl: Boolean(url),
      urlRef,
      hasServiceRoleKey: Boolean(key),
      keyPrefix: key ? `${key.slice(0, 10)}...` : null,
      keyParts: key ? key.split(".").length : 0,
      jwtRole: payload?.role ?? null,
      jwtProjectRef,
      jwtExpiresAt: payload?.exp ? new Date(payload.exp * 1000).toISOString() : null,
      keyProjectMatchesUrl: Boolean(urlRef && jwtProjectRef === urlRef),
    },
    null,
    2,
  ),
);
