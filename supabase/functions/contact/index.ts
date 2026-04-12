/**
 * Edge Function: contact
 *
 * Routes in-app feedback/contact form submissions via Resend.
 * Called from the Profile → "Feedback & Contact" row in the app.
 *
 * Request body: { email: string, message: string }
 *
 * Environment variables required:
 *   RESEND_API_KEY    — from resend.com dashboard
 *   FROM_EMAIL        — verified sender e.g. "Presence App <noreply@presence.app>"
 *   SUPPORT_EMAIL     — destination for inbound feedback e.g. "support@presence.app"
 *
 * Deploy:
 *   supabase functions deploy contact
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let senderEmail: string;
  let message: string;

  try {
    const body = await req.json();
    senderEmail = body.email;
    message = body.message;
    if (!senderEmail || !message) throw new Error("Missing fields");
  } catch {
    return new Response(JSON.stringify({ error: "email and message are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Presence App <noreply@presence.app>";
  const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") ?? "support@presence.app";

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping contact email");
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const html = `
<p><strong>From:</strong> ${senderEmail}</p>
<p><strong>Message:</strong></p>
<p style="white-space:pre-wrap;">${message}</p>
`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [SUPPORT_EMAIL],
      reply_to: senderEmail,
      subject: `Presence feedback from ${senderEmail}`,
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
