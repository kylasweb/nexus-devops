import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AiReportRequest {
  prompt: string;
}

async function tryOpenAI(prompt: string) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) return { ok: false, provider: "openai", error: "OPENAI_API_KEY not set" };
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-2025-04-14",
        messages: [
          { role: "system", content: "You are an expert analyst that produces concise, actionable reports." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.toString();
    if (!text) throw new Error("OpenAI empty response");
    return { ok: true, provider: "openai", text };
  } catch (error) {
    console.error("OpenAI error:", error);
    return { ok: false, provider: "openai", error: String(error) };
  }
}

async function tryOpenRouter(prompt: string) {
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) return { ok: false, provider: "openrouter", error: "OPENROUTER_API_KEY not set" };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert analyst that produces concise, actionable reports." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.toString();
    if (!text) throw new Error("OpenRouter empty response");
    return { ok: true, provider: "openrouter", text };
  } catch (error) {
    console.error("OpenRouter error:", error);
    return { ok: false, provider: "openrouter", error: String(error) };
  }
}

async function tryGemini(prompt: string) {
  const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!GEMINI_KEY) return { ok: false, provider: "gemini", error: "GOOGLE_GEMINI_API_KEY not set" };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.toString();
    if (!text) throw new Error("Gemini empty response");
    return { ok: true, provider: "gemini", text };
  } catch (error) {
    console.error("Gemini error:", error);
    return { ok: false, provider: "gemini", error: String(error) };
  }
}

async function tryHuggingFace(prompt: string) {
  const HF_TOKEN = Deno.env.get("HUGGING_FACE_ACCESS_TOKEN");
  if (!HF_TOKEN) return { ok: false, provider: "huggingface", error: "HUGGING_FACE_ACCESS_TOKEN not set" };
  try {
    // Using a widely available instruct model
    const model = "mistralai/Mixtral-8x7B-Instruct-v0.1";
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } }),
    });
    if (!res.ok) throw new Error(`HuggingFace HTTP ${res.status}`);
    const data = await res.json();
    // HF responses can be array or object depending on the model backend
    let text = "";
    if (Array.isArray(data) && data[0]?.generated_text) {
      text = data[0].generated_text;
    } else if (typeof data === "object" && data?.generated_text) {
      text = data.generated_text;
    } else if (Array.isArray(data) && data[0]?.summary_text) {
      text = data[0].summary_text;
    } else {
      text = JSON.stringify(data);
    }
    if (!text) throw new Error("HuggingFace empty response");
    return { ok: true, provider: "huggingface", text };
  } catch (error) {
    console.error("HuggingFace error:", error);
    return { ok: false, provider: "huggingface", error: String(error) };
  }
}

async function tryReplicate(prompt: string) {
  const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
  if (!REPLICATE_API_KEY) return { ok: false, provider: "replicate", error: "REPLICATE_API_KEY not set" };
  try {
    // Use Replicate text generation model
    const res = await fetch("https://api.replicate.com/v1/models/meta/meta-llama-3-8b-instruct/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${REPLICATE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { prompt },
      }),
    });
    if (!res.ok) throw new Error(`Replicate HTTP ${res.status}`);
    const data = await res.json();

    // Poll until completed
    let prediction = data;
    const endpoint = prediction?.urls?.get as string | undefined;
    if (!endpoint) throw new Error("Replicate missing status URL");

    for (let i = 0; i < 30; i++) {
      const check = await fetch(endpoint, {
        headers: { Authorization: `Token ${REPLICATE_API_KEY}` },
      });
      const body = await check.json();
      if (body.status === "succeeded") {
        const output = body.output;
        const text = Array.isArray(output) ? output.join("\n") : String(output ?? "");
        if (!text) throw new Error("Replicate empty output");
        return { ok: true, provider: "replicate", text };
      } else if (body.status === "failed" || body.status === "canceled") {
        throw new Error(`Replicate ${body.status}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Replicate timeout");
  } catch (error) {
    console.error("Replicate error:", error);
    return { ok: false, provider: "replicate", error: String(error) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { prompt } = (await req.json()) as AiReportRequest;
    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'prompt' string in body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const attempts = [tryOpenAI, tryOpenRouter, tryGemini, tryHuggingFace, tryReplicate];
    const results: Array<{ provider: string; error?: string }> = [];

    for (const attempt of attempts) {
      const r = await attempt(prompt);
      if (r.ok) {
        return new Response(
          JSON.stringify({ provider: r.provider, text: r.text }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      results.push({ provider: r.provider, error: r.error });
    }

    return new Response(
      JSON.stringify({ error: "All providers failed", attempts: results }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("ai-report handler error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
