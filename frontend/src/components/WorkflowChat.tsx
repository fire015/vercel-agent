"use client";

import { useCallback, useRef, useState } from "react";
import { useEveAgent } from "eve/react";

const WORKFLOW_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    nodes: { type: "array" },
    edges: { type: "array" },
  },
  required: ["nodes", "edges"],
} as const;

const PLACEHOLDER_WORKFLOW = JSON.stringify(
  {
    nodes: [
      {
        id: "section_start",
        type: "section",
        position: { x: 100, y: 100 },
        zIndex: -1,
        style: { width: 600, height: 300 },
        data: { label: "Answer script", guardrails: "", knowledge: "" },
      },
      {
        id: "question_start",
        type: "question",
        position: { x: 50, y: 50 },
        data: {
          label: "How can I help you today?",
          parent: "section_start",
          rules: "",
          intent: "",
          required_info: "",
          example_prompts: "",
          example_answers: "",
          example_summaries: "",
          use_ai_intent: false,
          auto_confirm: false,
        },
        parentId: "section_start",
        extent: "parent",
      },
    ],
    edges: [],
  },
  null,
  2
);

interface UpdatedWorkflow {
  nodes: unknown[];
  edges: unknown[];
}

export function WorkflowChat() {
  const [workflowJson, setWorkflowJson] = useState(PLACEHOLDER_WORKFLOW);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<UpdatedWorkflow | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agent = useEveAgent({
    onEvent(event) {
      if (event.type === "result.completed") {
        const updated = event.data.result as unknown as UpdatedWorkflow;
        if (updated?.nodes && updated?.edges) {
          setLatestResult(updated);
          setWorkflowJson(JSON.stringify(updated, null, 2));
        }
      }
    },
    onFinish() {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    },
  });

  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  const parseWorkflow = useCallback(() => {
    try {
      const parsed = JSON.parse(workflowJson);
      if (!parsed.nodes || !parsed.edges) {
        throw new Error('JSON must have "nodes" and "edges" arrays');
      }
      setWorkflowError(null);
      return parsed;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid JSON";
      setWorkflowError(message);
      return null;
    }
  }, [workflowJson]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const message = String(form.get("message") ?? "").trim();
      if (!message || isBusy) return;

      const workflow = parseWorkflow();
      if (!workflow) return;

      void agent.send({
        message,
        clientContext: workflow,
        outputSchema: WORKFLOW_OUTPUT_SCHEMA,
      });

      (e.currentTarget.elements.namedItem("message") as HTMLInputElement).value = "";
    },
    [agent, isBusy, parseWorkflow]
  );

  const handleCopy = useCallback(async () => {
    const text = latestResult ? JSON.stringify(latestResult, null, 2) : workflowJson;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [latestResult, workflowJson]);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Left panel — workflow JSON */}
      <div className="flex flex-col w-[45%] border-r border-zinc-800">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-sm font-semibold text-zinc-300 tracking-wide uppercase">Workflow JSON</span>
          <button
            onClick={handleCopy}
            className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <div className="flex flex-col flex-1 min-h-0 p-3 gap-2">
          <textarea
            className={`flex-1 w-full resize-none rounded-lg bg-zinc-900 text-zinc-200 font-mono text-xs p-3 outline-none border transition-colors ${
              workflowError ? "border-red-500 focus:border-red-400" : "border-zinc-700 focus:border-zinc-500"
            }`}
            value={workflowJson}
            onChange={(e) => {
              setWorkflowJson(e.target.value);
              setWorkflowError(null);
              setLatestResult(null);
            }}
            spellCheck={false}
            placeholder="Paste your { nodes, edges } JSON here…"
          />
          {workflowError && <p className="text-xs text-red-400 px-1">{workflowError}</p>}
          {latestResult && (
            <p className="text-xs text-emerald-400 px-1">
              ✓ Workflow updated — {latestResult.nodes.length} nodes, {latestResult.edges.length} edges
            </p>
          )}
        </div>
      </div>

      {/* Right panel — chat */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">Workflow Editor</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Describe a change and the agent will update your workflow JSON</p>
          </div>
          {agent.data.messages.length > 0 && (
            <button
              onClick={() => {
                agent.reset();
                setLatestResult(null);
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              New session
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {agent.data.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-lg">✦</div>
              <p className="text-zinc-400 text-sm max-w-xs">Paste your workflow JSON on the left, then describe what you want to change.</p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {[
                  "Add an appointment booking section",
                  "Add a conditional branch for Medical vs Admin",
                  "Change the opening question text",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      if (inputRef.current) inputRef.current.value = suggestion;
                      inputRef.current?.focus();
                    }}
                    className="text-xs text-zinc-400 border border-zinc-700 rounded-full px-3 py-1.5 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {agent.data.messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div key={message.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    A
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isUser ? "bg-indigo-600 text-white rounded-br-sm" : "bg-zinc-800 text-zinc-100 rounded-bl-sm"
                  }`}
                >
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <p key={i} className="whitespace-pre-wrap">
                          {part.text}
                        </p>
                      );
                    }
                    return null;
                  })}
                </div>
                {isUser && (
                  <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    U
                  </div>
                )}
              </div>
            );
          })}

          {isBusy && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">A</div>
              <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {agent.error && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-4 py-3">{agent.error.message}</div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="px-4 pb-4 pt-2 border-t border-zinc-800">
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <input
              ref={inputRef}
              name="message"
              disabled={isBusy}
              placeholder="Describe the change you want to make…"
              autoComplete="off"
              className="flex-1 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm px-4 py-3 outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-3 transition-colors shrink-0"
            >
              {isBusy ? "…" : "Send"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
