/**
 * Edge Function: generate-themes
 *
 * Generates personalised message themes for a single contact using OpenAI and
 * persists them to public.contact_themes.
 *
 * Called from the client whenever a contact is created or edited with the
 * required answers (Q1 + Q2 at minimum). Old themes whose used_at IS NULL
 * are deleted first so the rotation reflects the latest context (Phase 3).
 *
 * Request body: { contact_id: string, language?: "en"|"es"|"fr"|"it"|"pt" }
 * Response:     { themes: Array<{ id, theme_text, keywords }> }
 *
 * Environment variables required:
 *   SUPABASE_URL                — provided automatically in Functions runtime
 *   SUPABASE_ANON_KEY           — provided automatically
 *   SUPABASE_SERVICE_ROLE_KEY   — provided automatically
 *   OPENAI_API_KEY              — set via: supabase secrets set OPENAI_API_KEY=sk-...
 *
 * Deploy:
 *   supabase functions deploy generate-themes
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_MODEL = "gpt-4o-mini";
const THEME_COUNT = 6;

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
};

const SYSTEM_PROMPT = `You help someone strengthen real-life relationships. Given details about a specific person, generate exactly ${THEME_COUNT} short, specific, warm message ideas the user can send to them. These are conversation starters or check-ins about things that genuinely matter to this person — not generic small talk.

Each theme is a short ACTION PHRASE (not a full sentence) in lowercase infinitive form, written so it composes naturally as: "Tomorrow we'll remind you to {theme}."

CRITICAL: Use the literal placeholder {name} where the person's name belongs in the phrase — never the actual name. The client substitutes it at display time.

Examples of the exact format expected (assuming the contact's name is "Marco"):
- "ask {name} how his new job at the firm is going"
- "share that photo from the trip with {name}"
- "check in on how {name}'s mom is doing after the surgery"
- "tell {name} you're proud of him for finishing the marathon"
- "send {name} the book you mentioned last month"

Rules:
- Each theme must be specific to THIS person, drawing on the details provided. Do not invent facts that contradict the details.
- Lowercase, no leading capital, no trailing period.
- Always include the {name} placeholder (exact spelling, curly braces, lowercase) at least once per theme.
- Vary the verbs: ask, tell, share, check in on, send, remind, thank, congratulate, etc. Do not start every theme the same way.
- For each theme, also provide 3-5 short lowercase keyword tokens that would plausibly appear in a real message about that theme. Keywords are used to verify the user actually messaged about this topic, so they must be content words (nouns, verbs, topics), not greetings or fillers like "how", "are", "you", "the", "hi", "hey", "good".
- Keywords must NOT include the person's name and must NOT include the literal "{name}" placeholder.
- Output STRICTLY as JSON in this exact shape, no prose, no markdown:
  { "themes": [ { "text": string, "keywords": string[] } ] }
- Output exactly ${THEME_COUNT} themes.`;

interface Theme {
  text: string;
  keywords: string[];
}

interface Contact {
  id: string;
  user_id: string;
  name: string;
  how_known: string | null;
  cares_about: string | null;
  appreciate: string | null;
  want_to_say: string | null;
}

function buildUserPrompt(contact: Contact): string {
  const lines = [
    `Person's name: ${contact.name}`,
    `How we know each other: ${contact.how_known ?? "not specified"}`,
    `What they care about right now: ${contact.cares_about ?? "not specified"}`,
    `What I appreciate about them: ${contact.appreciate ?? "not specified"}`,
    `Things I've been meaning to say or ask: ${contact.want_to_say ?? "not specified"}`,
  ];
  return lines.join("\n");
}

function sanitizeThemes(raw: unknown): Theme[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { themes?: unknown }).themes;
  if (!Array.isArray(list)) return [];

  const cleaned: Theme[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const text = typeof (item as Theme).text === "string"
      ? (item as Theme).text.trim()
      : "";
    const keywordsRaw = (item as Theme).keywords;
    if (!text || !Array.isArray(keywordsRaw)) continue;

    const keywords = keywordsRaw
      .filter((k): k is string => typeof k === "string")
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 1 && k.length < 32)
      .slice(0, 5);

    if (keywords.length < 2) continue;
    cleaned.push({ text, keywords });
    if (cleaned.length >= THEME_COUNT) break;
  }
  return cleaned;
}

async function callOpenAI(
  apiKey: string,
  contact: Contact,
  languageCode: string,
): Promise<Theme[]> {
  const languageName = LANGUAGE_NAMES[languageCode] ?? "English";
  const localisedSystem = `${SYSTEM_PROMPT}\n\nWrite every theme in ${languageName}. Keywords must also be in ${languageName} (still lowercase, still content words, still excluding the {name} placeholder and the person's actual name).`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.8,
      messages: [
        { role: "system", content: localisedSystem },
        { role: "user", content: buildUserPrompt(contact) },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText}`);
  }

  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI returned no content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid JSON");
  }

  const themes = sanitizeThemes(parsed);
  if (themes.length === 0) {
    throw new Error("OpenAI returned no usable themes");
  }
  return themes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    let contactId: string;
    let language: string;
    try {
      const body = await req.json();
      contactId = (body.contact_id ?? "").toString().trim();
      language = (body.language ?? "en").toString().trim().toLowerCase();
      if (!contactId) throw new Error("missing contact_id");
    } catch {
      return new Response(JSON.stringify({ error: "contact_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller identity
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user }, error: userError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client for the DB read/write (we've already verified the
    // caller above; we then manually enforce user_id ownership on every query).
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: contact, error: contactErr } = await adminClient
      .from("contacts")
      .select("id, user_id, name, how_known, cares_about, appreciate, want_to_say")
      .eq("id", contactId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (contactErr) {
      console.error("Contact lookup error:", contactErr);
      return new Response(JSON.stringify({ error: "Contact lookup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!contact) {
      return new Response(JSON.stringify({ error: "Contact not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!contact.how_known || !contact.cares_about) {
      return new Response(
        JSON.stringify({ error: "Contact is missing required answers (Q1 + Q2)." }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const themes = await callOpenAI(OPENAI_API_KEY, contact as Contact, language);

    // Clear existing unused themes so the new ones replace them in rotation.
    // Used themes (used_at IS NOT NULL) stay for analytics history.
    const { error: deleteErr } = await adminClient
      .from("contact_themes")
      .delete()
      .eq("contact_id", contactId)
      .is("used_at", null);

    if (deleteErr) {
      console.error("Unused-theme delete error:", deleteErr);
      // Non-fatal — proceed to insert. Worst case the rotation pool grows.
    }

    const rows = themes.map((t) => ({
      contact_id: contactId,
      user_id: user.id,
      theme_text: t.text,
      keywords: t.keywords,
    }));

    const { data: inserted, error: insertErr } = await adminClient
      .from("contact_themes")
      .insert(rows)
      .select("id, theme_text, keywords");

    if (insertErr) {
      console.error("Theme insert error:", insertErr);
      return new Response(JSON.stringify({ error: "Theme insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ themes: inserted ?? [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-themes unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
