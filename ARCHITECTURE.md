# Researched Writer Agent — Architecture

## Philosophy

This system is modeled after Claude Code's core operating principles:

1. **Tool-first, not hallucination-first** — agents search, fetch, and verify before they write. Facts come from tools, not training data.
2. **Iterate, don't monolith** — each phase is a tight observe → decide → act loop, not a single large generation.
3. **Specialize via sub-agents** — distinct roles (researcher, synthesizer, writer, editor) prevent context contamination and allow parallel execution.
4. **Track state explicitly** — article progress, source lists, and open questions are stored as files, not held in model memory.
5. **Loop until quality, not until done** — feedback paths from editor → writer and synthesis → research exist for refinement.

---

## System Overview

```
                        ┌──────────────────────┐
User Brief ──────────▶  │   Orchestrator Agent  │
                        │  Plans · Tracks · Routes │
                        └──────────┬───────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
   ┌──────────▼──────────┐         │         ┌──────────▼──────────┐
   │  Research Agent A   │   (parallel)  │  Research Agent B   │
   │  Broad search sweep │         │         │  Deep-dive / quotes │
   └──────────┬──────────┘         │         └──────────┬──────────┘
              └────────────────────┼────────────────────┘
                                   │ research notes (files)
                        ┌──────────▼───────────┐
                        │   Synthesis Agent    │
                        │  Extracts · Maps     │
                        │  Flags gaps ──────────────▶ (back to Research)
                        └──────────┬───────────┘
                                   │ synthesis doc (file)
                        ┌──────────▼───────────┐
                        │    Outline Agent     │
                        │  Structures · Assigns sources to sections │
                        └──────────┬───────────┘
                                   │ outline (file)
              ┌────────────────────┼────────────────────┐
              │ section 1          │ section 2          │ section N
   ┌──────────▼──────────┐   ┌────▼────────┐   ┌──────▼──────────┐
   │   Writer Agent      │   │Writer Agent │   │  Writer Agent   │
   │   (per section)     │   │(per section)│   │  (per section)  │
   └──────────┬──────────┘   └────┬────────┘   └──────┬──────────┘
              └────────────────────┼────────────────────┘
                                   │ draft sections (files)
                        ┌──────────▼───────────┐
                        │    Editor Agent      │
                        │  Fact-check · Style  │
                        │  Coherence · Citations│
                        │  Rewrite requests ─────────▶ (back to Writer)
                        └──────────┬───────────┘
                                   │
                              Final Article
```

---

## Core Principles from Claude Code

| Claude Code Pattern | Writer Agent Application |
|---|---|
| TodoWrite for task tracking | Orchestrator maintains `state/todos.json` — research topics, sections, open questions |
| Agent tool spawns sub-agents | Orchestrator spawns Researcher, Synthesizer, Writer, Editor via SDK |
| Parallel tool calls | Research agents run concurrently across different search angles |
| Observe → decide → act loop | Each agent reads tool output before deciding the next tool call |
| Context economy | Agents receive only their relevant inputs (not the full conversation) |
| Verification before claiming done | Editor agent verifies all factual claims against stored source files |
| Memory for cross-session state | Article state, sources, and drafts persisted as files |

---

## Directory Structure (runtime state)

```
working-dir/
├── brief.md               # Original article request + constraints
├── state/
│   ├── todos.json         # Orchestrator task tracker
│   ├── sources.json       # Discovered sources with credibility scores
│   └── gaps.json          # Open research questions flagged by synthesis
├── research/
│   ├── broad_search.md    # Research Agent A output
│   ├── deep_dive.md       # Research Agent B output
│   └── *.md               # Additional research passes
├── synthesis/
│   └── knowledge_map.md   # Synthesized facts, themes, gaps
├── outline/
│   └── outline.md         # Section structure with source assignments
├── draft/
│   ├── section_01.md
│   ├── section_02.md
│   └── ...
└── output/
    └── article.md         # Final assembled and edited article
```

---

## Key Design Decisions

### Why file-based state instead of in-context passing?
Large research outputs would blow context windows if passed between agents directly. Files act as an external memory that any agent can read selectively — the same reason Claude Code reads files with the Read tool rather than holding them in the prompt.

### Why parallel research agents instead of one?
Different search angles benefit from fresh context. One agent biases its searches based on prior results; two parallel agents cover more ground without anchoring on each other.

### Why section-level writer agents?
Long articles need coherence within sections more than they need a single giant generation. Per-section agents can each hold their section's sources in full context, and sections can be parallelized once the outline is set.

### Why an explicit editor loop that can return to writer?
Claude Code doesn't report done before verifying. The editor agent can flag sections for rewrite rather than accepting a first draft — modeling the iterative improvement loop that characterizes how Claude Code approaches non-trivial tasks.

---

## Implementation Stack

- **SDK**: Anthropic Python SDK (`anthropic` package)
- **Agent pattern**: Each sub-agent is a function that creates a fresh `Messages` call with a specialized system prompt + tool list
- **Orchestrator**: Manages agent invocations, file I/O, and todo state; drives the pipeline state machine
- **Tool interface**: Tool definitions passed as JSON schemas to the Claude API; each agent only receives tools relevant to its phase
- **Models**:
  - Orchestrator: `claude-opus-4-7` (complex planning, routing decisions)
  - Research agents: `claude-sonnet-4-6` (speed + quality for search loops)
  - Writer agents: `claude-sonnet-4-6` (best prose quality per token)
  - Editor agent: `claude-opus-4-7` (nuanced critique and verification)

---

## Content Type Adaptations

| Content Type | Research Depth | Outline Style | Writing Tone |
|---|---|---|---|
| Long-form essay | Deep, 8–15 sources | Argument-driven with thesis | Analytical, voice-forward |
| Technical blog post | Medium, code-focused | Problem → Solution → Examples | Direct, opinionated |
| Research summary | Very deep, 20+ sources | Findings-first, structured | Neutral, precise |
| News / current events | Real-time search, 5–10 sources | Inverted pyramid | Clear, factual, dated |
