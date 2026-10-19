"use client";
import { FormEvent, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
const suggestions = ["How do I connect Stripe?", "Why didn’t a reminder send?", "How do tone presets work?"];

export function SupportChat({ supportEmail = "hello@settle.app" }: { supportEmail?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Hi! I’m Settle’s AI support assistant. I can help with setup and troubleshooting. What can I help you with?" }]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading, open]);

  async function send(event?: FormEvent<HTMLFormElement>, text = draft) {
    event?.preventDefault();
    const content = text.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/support/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.slice(-10) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not get a response. Please try again.");
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Support chat is temporarily unavailable.");
    } finally { setLoading(false); }
  }

  return <div className="support-widget">
    {open && <section className="support-panel" aria-label="Settle support chat">
      <header className="support-header"><span className="support-avatar">s</span><span><b>Settle support</b><small><i/> AI assistant · Here to help</small></span><button type="button" onClick={() => setOpen(false)} aria-label="Close support chat">×</button></header>
      <div className="support-context-note">I can answer questions from Settle’s help docs and your workspace. I can’t make account changes.</div>
      <div className="support-messages" ref={listRef} aria-live="polite">
        {messages.map((message, index) => <div className={`support-message ${message.role}`} key={`${index}-${message.role}`}><span className="message-avatar">{message.role === "user" ? "JD" : "s"}</span><p>{message.content}</p></div>)}
        {messages.length === 1 && <div className="support-suggestions">{suggestions.map((item) => <button key={item} onClick={() => send(undefined, item)} disabled={loading}>{item}</button>)}</div>}
        {loading && <div className="support-message assistant"><span className="message-avatar">s</span><p className="typing-indicator"><i/><i/><i/></p></div>}
      </div>
      {error && <p className="support-error" role="alert">{error}</p>}
      <form className="support-compose" onSubmit={(event) => send(event)}><textarea aria-label="Your message" placeholder="Ask a question…" rows={1} maxLength={1200} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(undefined); } }} /><button type="submit" disabled={!draft.trim() || loading} aria-label="Send message">↑</button></form>
      <div className="support-footnote">For urgent account issues, contact <a href={`mailto:${supportEmail}`}>support</a>.</div>
    </section>}
    <button className={`support-launcher ${open ? "is-open" : ""}`} type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close support chat" : "Open Settle support chat"} aria-expanded={open}>{open ? "×" : <><span>✳</span><b>Help</b></>}</button>
  </div>;
}
