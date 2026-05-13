import { useEffect, useRef } from "react";
import {
  Search, Layers, AlignLeft, PenLine, CheckCheck,
  FileText, Loader2, CheckCircle2, Circle,
} from "lucide-react";

const PHASES = [
  { key: "brief",       label: "Brief",       icon: FileText },
  { key: "research",    label: "Research",     icon: Search },
  { key: "synthesis",   label: "Synthesis",    icon: Layers },
  { key: "outline",     label: "Outline",      icon: AlignLeft },
  { key: "writing",     label: "Writing",      icon: PenLine },
  { key: "editing",     label: "Editing",      icon: CheckCheck },
  { key: "done",        label: "Complete",     icon: CheckCircle2 },
];

const AGENT_LABELS = {
  orchestrator: "Orchestrator",
  researcher_broad: "Researcher — Broad sweep",
  researcher_deep: "Researcher — Deep dive",
  researcher_gaps: "Researcher — Gap fill",
  synthesizer: "Synthesizer",
  outliner: "Outliner",
  editor: "Editor",
};

function agentLabel(agent) {
  if (!agent) return "";
  if (agent.startsWith("writer_s")) return `Writer — Section ${agent.replace("writer_s", "")}`;
  return AGENT_LABELS[agent] || agent;
}

export default function PipelineProgress({ events }) {
  const logRef = useRef(null);

  // Auto-scroll the log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const currentPhase = [...events]
    .reverse()
    .find((e) => e.phase)?.phase ?? null;

  const phaseStatus = (key) => {
    const phaseEvents = events.filter((e) => e.phase === key);
    if (!phaseEvents.length) return "pending";
    const hasComplete = phaseEvents.some((e) => e.type === "phase_complete");
    const hasStart = phaseEvents.some((e) => e.type === "phase_start");
    if (hasComplete) return "done";
    if (hasStart) return "active";
    return "pending";
  };

  const logs = events.filter((e) => e.type === "agent_log");
  const latestMessage = [...events].reverse().find((e) => e.message)?.message ?? "Initializing…";

  return (
    <div className="space-y-6">
      {/* Phase stepper */}
      <div className="flex items-start gap-1">
        {PHASES.map((phase, i) => {
          const status = phaseStatus(phase.key);
          const Icon = phase.icon;
          return (
            <div key={phase.key} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="flex items-center w-full">
                {i > 0 && (
                  <div
                    className={`h-0.5 flex-1 transition-colors ${
                      status === "done" ? "bg-indigo-500" : "bg-gray-200"
                    }`}
                  />
                )}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    status === "done"
                      ? "bg-indigo-600 text-white"
                      : status === "active"
                      ? "bg-indigo-100 border-2 border-indigo-600 text-indigo-600"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {status === "active" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Icon size={14} />
                  )}
                </div>
                {i < PHASES.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 transition-colors ${
                      phaseStatus(PHASES[i + 1].key) !== "pending" || status === "done"
                        ? "bg-indigo-500"
                        : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
              <span
                className={`text-[10px] font-medium text-center leading-tight ${
                  status === "done"
                    ? "text-indigo-700"
                    : status === "active"
                    ? "text-indigo-600"
                    : "text-gray-400"
                }`}
              >
                {phase.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current status */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-sm text-indigo-800 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse-dot flex-shrink-0" />
        {latestMessage}
      </div>

      {/* Agent activity log */}
      {logs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Agent Activity
          </p>
          <div
            ref={logRef}
            className="bg-gray-900 rounded-lg p-3 h-48 overflow-y-auto text-xs font-mono space-y-1"
          >
            {logs.map((e, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-500 flex-shrink-0 pt-px">›</span>
                <span className="text-gray-400">
                  {e.agent && (
                    <span className="text-indigo-400">[{agentLabel(e.agent)}] </span>
                  )}
                  <span className="text-gray-300">{e.message}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
