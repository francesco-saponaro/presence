/**
 * Edge Function: revenuecat-webhook
 *
 * Receives RevenueCat server-to-server webhook events and syncs the
 * subscription status to the public.profiles table.
 *
 * Setup in RevenueCat dashboard:
 *   Project Settings → Integrations → Webhooks → Add Endpoint
 *   URL: https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
 *   Authorization header: Bearer <REVENUECAT_WEBHOOK_SECRET>
 *
 * Set environment variable REVENUECAT_WEBHOOK_SECRET in Supabase:
 *   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<your-secret>
 *
 * Deploy:
 *   supabase functions deploy revenuecat-webhook --no-verify-jwt
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// RevenueCat event types that indicate an active subscription
const ACTIVE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "SUBSCRIBER_ALIAS",
]);

// RevenueCat event types that indicate a lapsed/cancelled subscription
const INACTIVE_EVENTS = new Set([
  "CANCELLATION",
  "EXPIRATION",
  "BILLING_ISSUE",
  "SUBSCRIBER_DELETION",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify webhook secret
  const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  if (webhookSecret) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const event = body.event as Record<string, unknown> | undefined;
  if (!event) {
    return new Response(JSON.stringify({ error: "Missing event" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventType = event.type as string;
  const appUserId = event.app_user_id as string | undefined;
  const expiresAtMs = event.expiration_at_ms as number | undefined;

  if (!appUserId) {
    // Nothing to do if we have no user ID
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const isActive = ACTIVE_EVENTS.has(eventType);
  const isInactive = INACTIVE_EVENTS.has(eventType);

  if (!isActive && !isInactive) {
    // Unknown event type — acknowledge without acting
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const subscriptionExpiresAt = expiresAtMs
    ? new Date(expiresAtMs).toISOString()
    : null;

  const { error } = await adminClient
    .from("profiles")
    .update({
      is_subscribed: isActive,
      subscription_expires_at: isActive ? subscriptionExpiresAt : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appUserId);

  if (error) {
    console.error("Profile update error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // If a purchase just completed, trigger welcome email
  if (eventType === "INITIAL_PURCHASE") {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("email")
      .eq("id", appUserId)
      .single();

    if (profile?.email) {
      await adminClient.functions.invoke("welcome-email", {
        body: { email: profile.email },
      });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
