/**
 * Edge Function: welcome-email
 *
 * Sends a transactional welcome email via Resend when a user completes
 * their first purchase.
 *
 * Can be called:
 *   - Directly from the revenuecat-webhook function (server-to-server)
 *   - From the client immediately after a successful purchase as a fallback
 *
 * Environment variables required:
 *   RESEND_API_KEY    — from resend.com dashboard
 *   FROM_EMAIL        — verified sender address e.g. "Presence <hello@presence.app>"
 *
 * Set with:
 *   supabase secrets set RESEND_API_KEY=re_xxxx FROM_EMAIL="Presence <hello@presence.app>"
 *
 * Deploy:
 *   supabase functions deploy welcome-email
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let email: string;
  try {
    const body = await req.json();
    email = body.email;
    if (!email || typeof email !== "string") throw new Error("Missing email");
  } catch {
    return new Response(JSON.stringify({ error: "Missing or invalid email" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL");

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping welcome email");
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Presence</title>
</head>
<body style="margin:0;padding:0;background-color:#FAF7F2;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F2;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#EBE6DF;border-radius:20px;padding:40px;border:1px solid #C6C0B9;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-size:28px;font-weight:700;color:#422701;letter-spacing:-0.5px;">Presence</span>
            </td>
          </tr>
          <tr>
            <td style="color:#2A1800;font-size:22px;font-weight:600;padding-bottom:16px;line-height:1.3;">
              Welcome. You chose real over viral.
            </td>
          </tr>
          <tr>
            <td style="color:#705E46;font-size:16px;line-height:1.6;padding-bottom:24px;">
              Your 7-day free trial has started. Every day you use Presence is a day you chose depth over noise.
            </td>
          </tr>
          <tr>
            <td style="color:#705E46;font-size:16px;line-height:1.6;padding-bottom:32px;">
              The shield goes up at your chosen time. When it does, reach out to someone real — a text, a call, anything that counts. Upload the screenshot and unlock your world.
            </td>
          </tr>
          <tr>
            <td style="color:#C6C0B9;font-size:13px;padding-top:24px;border-top:1px solid #C6C0B9;">
              © 2026 Presence. All rights reserved.<br />
              <a href="#" style="color:#D6B588;text-decoration:none;">Terms of Service</a>
              &nbsp;·&nbsp;
              <a href="#" style="color:#D6B588;text-decoration:none;">Privacy Policy</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [email],
      subject: "Welcome to Presence — you chose real.",
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return new Response(JSON.stringify({ error: "Email send failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ sent: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
