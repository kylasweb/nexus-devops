import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Index = () => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string>("");

  const analyze = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter some text to analyze");
      return;
    }
    setLoading(true);
    setOutput("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-report", {
        body: { prompt },
      });
      if (error) throw error;
      setOutput(data?.text || "");
      toast.success(`Analyzed via ${data?.provider ?? "provider"}`);
    } catch (err: any) {
      console.error(err);
      // Fallback to Puter.js in the browser if available
      try {
        const p = (window as any)?.puter;
        if (p?.ai?.chat) {
          const text = await p.ai.chat(prompt, { model: "gpt-4.1-nano" });
          if (text) {
            setOutput(typeof text === "string" ? text : String(text));
            toast.success("Analyzed via Puter.js fallback");
            return;
          }
        }
        throw err;
      } catch (fallbackErr: any) {
        console.error("Puter.js fallback failed:", fallbackErr);
        toast.error(err?.message || "Analysis failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <section className="container max-w-3xl py-16 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">AI Analysis & Reporting</h1>
          <p className="text-muted-foreground">Type any context or logs below. The system will analyze with provider fallbacks automatically.</p>
        </header>
        <div className="space-y-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Paste provision logs or any text to analyze..."
            className="min-h-[160px]"
          />
          <div className="flex items-center gap-3">
            <Button onClick={analyze} disabled={loading}>
              {loading ? "Analyzing..." : "Analyze"}
            </Button>
            {output && (
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(output)}>
                Copy Output
              </Button>
            )}
          </div>
        </div>
        {output && (
          <article className="rounded-lg border bg-card p-4 md:p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Result</h2>
            <pre className="whitespace-pre-wrap break-words text-sm md:text-base text-foreground">{output}</pre>
          </article>
        )}
      </section>
    </main>
  );
};

export default Index;
