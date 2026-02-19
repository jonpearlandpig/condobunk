import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Domain Detection Engine (Deterministic) ───

const FILENAME_HINTS: Record<string, string[]> = {
  SCHEDULE: ["schedule", "itinerary", "routing", "dates", "calendar"],
  CONTACTS: ["contacts", "directory", "crew", "roster", "personnel"],
  RUN_OF_SHOW: ["ros", "run of show", "runofshow", "runsheet", "cue"],
  FINANCE: ["budget", "settlement", "p&l", "pnl", "finance", "expenses"],
  TRAVEL: ["travel", "flights", "hotel", "transport", "logistics"],
  TECH: ["rider", "stage plot", "tech", "production", "audio", "lighting"],
  HOSPITALITY: ["hospitality", "catering", "hotel", "accommodation"],
  CAST: ["cast", "artist", "talent", "performer"],
  VENUE: ["venue", "room", "hall", "arena", "theater"],
};

const KEYWORD_SETS: Record<string, string[]> = {
  SCHEDULE: [
    "load-in", "load in", "doors", "show", "soundcheck", "curfew",
    "venue", "city", "date", "set time", "showtime", "downbeat",
  ],
  CONTACTS: [
    "phone", "email", "cell", "ext", "manager", "production",
    "foh", "monitor", "ld", "rigger", "tm", "promoter", "@",
  ],
  RUN_OF_SHOW: [
    "act", "intro", "walk-on", "cues", "setlist", "segment",
    "timecode", "blackout", "encore", "intermission",
  ],
  FINANCE: [
    "gross", "net", "guarantee", "settlement", "expenses",
    "labor", "catering", "hotel", "per diem", "merch", "$",
  ],
  TRAVEL: [
    "flight", "depart", "arrive", "hotel", "check-in",
    "checkout", "bus", "van", "driver", "pickup",
  ],
};

interface DomainResult {
  doc_type: string;
  confidence: number;
  scores: Record<string, number>;
}

function detectDomain(filename: string, text: string): DomainResult {
  const fn = filename.toLowerCase();
  const lowerText = text.toLowerCase();
  const scores: Record<string, number> = {};

  // Filename heuristics (weight 0.45)
  for (const [dtype, hints] of Object.entries(FILENAME_HINTS)) {
    scores[dtype] = (scores[dtype] || 0);
    for (const hint of hints) {
      if (fn.includes(hint)) {
        scores[dtype] += 0.45;
        break;
      }
    }
  }

  // Keyword scoring (weight 0.35)
  for (const [dtype, keywords] of Object.entries(KEYWORD_SETS)) {
    let matched = 0;
    for (const kw of keywords) {
      if (lowerText.includes(kw)) matched++;
    }
    const kwScore = Math.min(matched / Math.max(keywords.length * 0.4, 1), 1) * 0.35;
    scores[dtype] = (scores[dtype] || 0) + kwScore;
  }

  // Structural patterns (weight 0.20)
  const timePattern = /\b\d{1,2}:\d{2}\s*(am|pm|AM|PM)?\b/g;
  const emailPattern = /[\w.+-]+@[\w-]+\.[\w.]+/g;
  const phonePattern = /(\+1|1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
  const currencyPattern = /\$[\d,.]+/g;

  const timeCount = (lowerText.match(timePattern) || []).length;
  const emailCount = (text.match(emailPattern) || []).length;
  const phoneCount = (text.match(phonePattern) || []).length;
  const currencyCount = (text.match(currencyPattern) || []).length;

  if (timeCount > 5) {
    scores["SCHEDULE"] = (scores["SCHEDULE"] || 0) + 0.15;
    scores["RUN_OF_SHOW"] = (scores["RUN_OF_SHOW"] || 0) + 0.10;
  }
  if (emailCount > 3 || phoneCount > 3) {
    scores["CONTACTS"] = (scores["CONTACTS"] || 0) + 0.20;
  }
  if (currencyCount > 3) {
    scores["FINANCE"] = (scores["FINANCE"] || 0) + 0.20;
  }

  // Find top
  let topType = "UNKNOWN";
  let topScore = 0;
  for (const [dtype, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topType = dtype;
    }
  }

  if (topScore < 0.30) topType = "UNKNOWN";

  return { doc_type: topType, confidence: topScore, scores };
}

// ─── Extractors ───

interface ScheduleEvent {
  city?: string;
  venue?: string;
  event_date?: string;
  load_in?: string;
  show_time?: string;
  end_time?: string;
  confidence_score: number;
}

function extractSchedule(text: string): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // ISO date or common date patterns
  const dateRegex =
    /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s*\d{2,4})\b/i;
  const timeRegex = /\b(\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)?)\b/;
  const venueIndicators = /(?:venue|hall|arena|theater|theatre|club|room|amphitheater|stadium)/i;

  let currentDate: string | undefined;
  let currentVenue: string | undefined;
  let currentCity: string | undefined;

  for (const line of lines) {
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      currentDate = dateMatch[1];
    }

    // Look for venue/city on lines with location-like content
    if (venueIndicators.test(line) || (line.includes(",") && !timeRegex.test(line) && !dateMatch)) {
      const parts = line.split(/[,\-–—|]/).map((p) => p.trim());
      if (parts.length >= 2) {
        currentVenue = parts[0].replace(/^(venue|at|@)\s*:?\s*/i, "");
        currentCity = parts[1];
      } else if (parts.length === 1) {
        currentVenue = parts[0];
      }
    }

    // Extract times
    const times = line.match(/\b\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)?\b/g);
    if (times && currentDate) {
      let load_in: string | undefined;
      let show_time: string | undefined;
      let end_time: string | undefined;

      const lowerLine = line.toLowerCase();
      if (lowerLine.includes("load") || lowerLine.includes("li")) {
        load_in = times[0];
      }
      if (lowerLine.includes("show") || lowerLine.includes("downbeat")) {
        show_time = times[times.length > 1 ? 1 : 0];
      }
      if (lowerLine.includes("end") || lowerLine.includes("curfew")) {
        end_time = times[times.length - 1];
      }

      // If no keywords, assign by position
      if (!load_in && !show_time && !end_time) {
        if (times.length >= 3) {
          load_in = times[0];
          show_time = times[1];
          end_time = times[2];
        } else if (times.length === 2) {
          show_time = times[0];
          end_time = times[1];
        } else {
          show_time = times[0];
        }
      }

      let confidence = 0;
      if (currentDate) confidence += 0.40;
      if (currentVenue) confidence += 0.20;
      if (currentCity) confidence += 0.15;
      if (show_time) confidence += 0.15;
      if (load_in) confidence += 0.10;

      events.push({
        event_date: currentDate,
        venue: currentVenue,
        city: currentCity,
        load_in,
        show_time,
        end_time,
        confidence_score: Math.round(confidence * 100) / 100,
      });
    }
  }

  return events;
}

interface Contact {
  name: string;
  phone?: string;
  email?: string;
  role?: string;
}

function extractContacts(text: string): Contact[] {
  const contacts: Contact[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.]+/;
  const phoneRegex = /(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/;
  const roleKeywords = [
    "tm", "tour manager", "production", "foh", "monitor", "ld",
    "lighting", "rigger", "backline", "merch", "promoter",
    "manager", "agent", "catering", "runner", "driver", "security",
  ];

  for (const line of lines) {
    const email = line.match(emailRegex)?.[0];
    const phone = line.match(phoneRegex)?.[1];

    if (!email && !phone) continue;

    // Try to extract name (usually first part of line before phone/email/separator)
    let name = line
      .replace(emailRegex, "")
      .replace(phoneRegex, "")
      .split(/[|;–—\t]/)
      .map((p) => p.trim())
      .filter(Boolean)[0] || "";

    // Detect role
    let role: string | undefined;
    const lowerLine = line.toLowerCase();
    for (const rk of roleKeywords) {
      if (lowerLine.includes(rk)) {
        role = rk.toUpperCase();
        // Remove role from name if it's there
        name = name.replace(new RegExp(rk, "i"), "").trim();
        break;
      }
    }

    // Clean up name
    name = name.replace(/^[:\-–—,.\s]+|[:\-–—,.\s]+$/g, "").trim();
    if (!name || name.length < 2) name = "Unknown";

    contacts.push({ name, phone, email, role });
  }

  return contacts;
}

interface FinanceLine {
  category?: string;
  amount?: number;
  venue?: string;
  line_date?: string;
}

function extractFinance(text: string): FinanceLine[] {
  const lines_arr: FinanceLine[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const amountRegex = /\$?([\d,]+\.?\d*)/;

  for (const line of lines) {
    const match = line.match(amountRegex);
    if (!match) continue;

    const amount = parseFloat(match[1].replace(/,/g, ""));
    if (isNaN(amount)) continue;

    const cleaned = line.replace(amountRegex, "").trim();
    const parts = cleaned.split(/[|;–—\t,]/).map((p) => p.trim()).filter(Boolean);

    lines_arr.push({
      category: parts[0] || "Uncategorized",
      amount,
      venue: parts[1],
    });
  }

  return lines_arr;
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client for auth validation
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for writes
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { document_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch document
    const { data: doc, error: docErr } = await adminClient
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is tour member
    const { data: membership } = await adminClient
      .from("tour_members")
      .select("role")
      .eq("tour_id", doc.tour_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["TA", "MGMT"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let rawText = doc.raw_text || "";
    const filename = doc.filename || "";

    // If no raw_text, try to download from storage and extract
    if (!rawText && doc.file_path) {
      const { data: fileData, error: dlErr } = await adminClient.storage
        .from("document-files")
        .download(doc.file_path);

      if (!dlErr && fileData) {
        const isPdf = (filename || "").toLowerCase().endsWith(".pdf");

        if (isPdf) {
          // Use AI to extract text from PDF
          const apiKey = Deno.env.get("LOVABLE_API_KEY");
          if (apiKey) {
            try {
              const arrayBuf = await fileData.arrayBuffer();
              const bytes = new Uint8Array(arrayBuf);
              let binary = "";
              const chunkSize = 8192;
              for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
              }
              const base64 = btoa(binary);

              const aiResp = await fetch(
                "https://ai.gateway.lovable.dev/v1/chat/completions",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "google/gemini-2.5-flash",
                    messages: [
                      {
                        role: "user",
                        content: [
                          {
                            type: "text",
                            text: "Extract ALL text content from this PDF document. Return ONLY the raw text, preserving the structure (dates, times, names, emails, phone numbers, dollar amounts). Do not summarize or interpret — just extract the text verbatim.",
                          },
                          {
                            type: "image_url",
                            image_url: {
                              url: `data:application/pdf;base64,${base64}`,
                            },
                          },
                        ],
                      },
                    ],
                  }),
                }
              );

              if (aiResp.ok) {
                const aiData = await aiResp.json();
                rawText =
                  aiData.choices?.[0]?.message?.content || "";

                // Save extracted text back to the document
                if (rawText) {
                  await adminClient
                    .from("documents")
                    .update({ raw_text: rawText })
                    .eq("id", document_id);
                }
              }
            } catch (aiErr) {
              console.error("AI text extraction failed:", aiErr);
            }
          }
        } else {
          // Text-based file
          rawText = await fileData.text();
          if (rawText) {
            await adminClient
              .from("documents")
              .update({ raw_text: rawText })
              .eq("id", document_id);
          }
        }
      }
    }

    // Stage 2: Domain detection
    const domain = detectDomain(filename, rawText);

    // Update doc_type
    await adminClient
      .from("documents")
      .update({ doc_type: domain.doc_type })
      .eq("id", document_id);

    // Stage 3: Extract based on type
    let extractionResult: Record<string, unknown> = {
      doc_type: domain.doc_type,
      domain_confidence: domain.confidence,
      extracted_count: 0,
    };

    if (domain.doc_type === "SCHEDULE") {
      const events = extractSchedule(rawText);
      for (const evt of events) {
        await adminClient.from("schedule_events").insert({
          tour_id: doc.tour_id,
          city: evt.city,
          venue: evt.venue,
          event_date: evt.event_date,
          load_in: evt.load_in ? null : null, // timestamps need proper parsing
          show_time: evt.show_time ? null : null,
          end_time: evt.end_time ? null : null,
          confidence_score: evt.confidence_score,
          source_doc_id: document_id,
        });
      }
      extractionResult.extracted_count = events.length;
      extractionResult.events = events;
    } else if (domain.doc_type === "CONTACTS") {
      const contacts = extractContacts(rawText);
      for (const c of contacts) {
        await adminClient.from("contacts").insert({
          tour_id: doc.tour_id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          role: c.role,
          source_doc_id: document_id,
        });
      }
      extractionResult.extracted_count = contacts.length;
    } else if (domain.doc_type === "FINANCE") {
      const flines = extractFinance(rawText);
      for (const fl of flines) {
        await adminClient.from("finance_lines").insert({
          tour_id: doc.tour_id,
          category: fl.category,
          amount: fl.amount,
          venue: fl.venue,
          line_date: fl.line_date,
        });
      }
      extractionResult.extracted_count = flines.length;
    }

    // Stage 5: Activate document if extraction succeeded
    if (
      extractionResult.extracted_count &&
      (extractionResult.extracted_count as number) > 0
    ) {
      // Deactivate previous versions of same doc_type for this tour
      await adminClient
        .from("documents")
        .update({ is_active: false })
        .eq("tour_id", doc.tour_id)
        .eq("doc_type", domain.doc_type)
        .neq("id", document_id);

      // Activate this one
      await adminClient
        .from("documents")
        .update({ is_active: true })
        .eq("id", document_id);
    }

    return new Response(JSON.stringify(extractionResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
