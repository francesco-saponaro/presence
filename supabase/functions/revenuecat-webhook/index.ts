/**
 * Edge Function: revenuecat-webhook
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

// RevenueCat event types that indicate an active subscription
const ACTIVE_EVENTS = ["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION"];
// RevenueCat event types that indicate a lapsed/cancelled subscription
const INACTIVE_EVENTS = ["CANCELLATION", "EXPIRATION", "BILLING_ISSUE"];

Deno.serve(async (req: Request) => {
  // 1. Strict Security Check
  const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  const authHeader = req.headers.get("Authorization");

  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    console.error("Unauthorized webhook attempt");
    return new Response("Unauthorized", { status: 403 });
  }

  try {
    // 2. Parse the RevenueCat Event
    const body = await req.json();
    const event = body.event;

    if (!event) return new Response("Missing event", { status: 400 });

    const eventType = event.type;
    const appUserId = event.app_user_id;
    const expiresAtMs = event.expiration_at_ms;

    // 3. The Anonymous User Fix (from your old code!)
    if (!appUserId || appUserId.startsWith("$RCAnonymous")) {
      console.log("Ignored anonymous user");
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Initialize Supabase Admin (bypasses Row Level Security)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const subscriptionExpiresAt = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;

    // 4. Handle Active Subscriptions
    if (ACTIVE_EVENTS.includes(eventType)) {
      console.log(`[RevenueCat] Unlocking Pro for user: ${appUserId}`);
      
      const { error } = await adminClient
        .from("profiles") // NOTE: Ensure your table is named 'profiles' (old code used 'users')
        .update({
          is_subscribed: true, // NOTE: Ensure your column is 'is_subscribed' (old code used 'is_pro')
          subscription_expires_at: subscriptionExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", appUserId);

      if (error) throw error;

      // Trigger welcome email on first purchase
      if (eventType === "INITIAL_PURCHASE") {
        const { data: profile } = await adminClient.from("profiles").select("email").eq("id", appUserId).single();
        if (profile?.email) {
          // Assuming you have a 'welcome-email' function deployed
          await adminClient.functions.invoke("welcome-email", {
            body: { email: profile.email },
          });
        }
      }
    }

    // 5. Handle Cancellations & Expirations
    if (INACTIVE_EVENTS.includes(eventType)) {
      console.log(`[RevenueCat] Removing Pro for user: ${appUserId}`);
      
      const { error } = await adminClient
        .from("profiles")
        .update({
          is_subscribed: false,
          subscription_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", appUserId);

      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error: any) {
    console.error(`Error processing RevenueCat webhook: ${error.message}`);
    return new Response("Webhook handler failed", { status: 500 });
  }
});