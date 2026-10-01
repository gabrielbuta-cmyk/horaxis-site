// POST /support/start — the only way into Axis (2026-10-01).
//
// The installation's Support page POSTs {licence, product} here in a new tab. A valid,
// unexpired, unblocked licence opens a 2-hour session and redirects to /support.
// Anything else — a GET, a bad or expired licence, a blocked customer — is a plain 404.
import { verifyLicence, sha256Hex, isBlocked, createSession, sessionCookie, notFound } from "../../lib/axis.js";

export const onRequest = async ({ request, env }) => {
  if (request.method !== "POST" || !env.SUPPORT_KV) return notFound(env, request);

  let licence = "";
  try {
    const form = await request.formData();
    licence = String(form.get("licence") || "").trim();
  } catch (e) {
    return notFound(env, request);
  }
  if (!licence || licence.length > 8192) return notFound(env, request);

  const lic = await verifyLicence(licence);
  if (!lic) return notFound(env, request);
  const licenceHash = await sha256Hex(licence);
  if (await isBlocked(env, licenceHash, lic.customer)) return notFound(env, request);

  // The licence itself is not stored — only its hash, for the block list.
  const id = await createSession(env, { ...lic, licence_hash: licenceHash });
  return new Response(null, {
    status: 303,
    headers: { Location: "/support", "Set-Cookie": sessionCookie(id), "Cache-Control": "no-store",
               "Referrer-Policy": "no-referrer" },
  });
};
