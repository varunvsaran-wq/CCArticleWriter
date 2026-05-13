export const MOCK_SOURCES = [
  {
    id: "1",
    title: "Attention Is All You Need",
    url: "https://arxiv.org/abs/1706.03762",
    author: "Vaswani Ashish",
    publication: "arXiv",
    date: "2017-06-12",
    type: "article",
    credibility: "high",
  },
  {
    id: "2",
    title: "Language Models are Few-Shot Learners",
    url: "https://arxiv.org/abs/2005.14165",
    author: "Brown Tom",
    publication: "arXiv / NeurIPS",
    date: "2020-05-28",
    type: "article",
    credibility: "high",
  },
  {
    id: "3",
    title: "Constitutional AI: Harmlessness from AI Feedback",
    url: "https://arxiv.org/abs/2212.08073",
    author: "Bai Yuntao",
    publication: "Anthropic",
    date: "2022-12-15",
    type: "article",
    credibility: "high",
  },
  {
    id: "4",
    title: "Scaling Laws for Neural Language Models",
    url: "https://arxiv.org/abs/2001.08361",
    author: "Kaplan Jared",
    publication: "arXiv",
    date: "2020-01-23",
    type: "article",
    credibility: "high",
  },
  {
    id: "5",
    title: "Tool Use and Agentic AI: A Survey",
    url: "https://example.com/agentic-ai-survey",
    author: "Zhang Wei",
    publication: "AI Research Quarterly",
    date: "2024-02-10",
    type: "article",
    credibility: "medium",
  },
];

export const MOCK_ARTICLE = {
  id: "demo01",
  title: "The Architecture of Modern AI Agents: From Tokens to Tools",
  content: `# The Architecture of Modern AI Agents: From Tokens to Tools

The moment you ask a language model to browse the web, write a file, or spawn another agent, something fundamentally changes. The model is no longer a text predictor — it is a reasoning actor embedded in a loop. Understanding how that loop works is the key to building reliable AI systems in 2024.

## The Transformer Foundation

Everything begins with attention. The 2017 paper *Attention Is All You Need* [1] introduced the transformer architecture that underpins virtually every capable language model today. At its core, a transformer learns to weigh the importance of each token against every other token in a sequence — a mechanism that lets it hold long-range dependencies in context without the vanishing gradients that plagued earlier recurrent networks.

What made the transformer so consequential was not just its accuracy on benchmark tasks, but its scalability. When researchers at OpenAI published *Language Models are Few-Shot Learners* [2] and demonstrated GPT-3's emergent abilities with 175 billion parameters, it became clear that transformer scale unlocked qualitatively new capabilities: in-context learning, chain-of-thought reasoning, and instruction following — none of which were explicitly trained, but all of which emerged from sufficient scale.

The scaling laws that govern this relationship [4] show a smooth, predictable improvement in capability as parameters, data, and compute increase — a regularity that has guided investment decisions across the entire field.

## From Prediction to Action: The Agentic Loop

A base language model, trained purely to predict the next token, has no way to act on the world. It can describe how to search the web but cannot actually do it. The leap to agency requires three additions: **tool definitions**, **tool execution**, and a **feedback loop** that lets the model observe results before deciding what to do next.

The pattern looks like this:

1. The model receives a task and a set of tool schemas (as JSON)
2. Instead of generating text, it outputs a *tool call* — a structured request to invoke a specific function
3. The host system executes the tool and returns the result
4. The result is appended to the conversation, and the model decides its next step
5. This cycle repeats until the model signals it is done

This observe → decide → act loop is the architectural primitive behind every capable AI agent today [5]. It is what allows a model to search for information it does not know, verify facts before citing them, and adapt its approach when a tool returns an unexpected result.

## Alignment and the Constitutional Approach

Raw capability without alignment is dangerous. Anthropic's Constitutional AI [3] addresses this by training models with a set of explicit principles — a "constitution" — that guides both supervised fine-tuning and reinforcement learning from AI feedback (RLAIF). Rather than relying solely on human raters to label every response, constitutional AI lets the model critique and revise its own outputs against the stated principles.

The result is a model that can reason about why a response might be harmful, not just pattern-match against a list of prohibited outputs. This distinction matters enormously in agentic settings, where a model may encounter novel situations that no human reviewer anticipated.

## What This Means for Builders

For engineers building on top of these architectures, the practical implications are clear. First, **tools are the interface** — the quality of your tool schemas (descriptions, parameter names, error messages) directly determines whether the model uses them correctly. Second, **context is memory** — because models have no persistent state, everything the agent needs to know must be in the context window or retrievable via tools. Third, **loops need limits** — without explicit stopping conditions and iteration caps, agentic loops can spiral into infinite retries or resource exhaustion.

The most reliable agentic systems treat the model as a reasoning core embedded in a host environment that handles state, retries, and side effects. The model decides *what* to do; the host ensures it happens safely.

## References

[1] Attention Is All You Need — arXiv, 2017-06-12 — https://arxiv.org/abs/1706.03762

[2] Language Models are Few-Shot Learners — arXiv / NeurIPS, 2020-05-28 — https://arxiv.org/abs/2005.14165

[3] Constitutional AI: Harmlessness from AI Feedback — Anthropic, 2022-12-15 — https://arxiv.org/abs/2212.08073

[4] Scaling Laws for Neural Language Models — arXiv, 2020-01-23 — https://arxiv.org/abs/2001.08361

[5] Tool Use and Agentic AI: A Survey — AI Research Quarterly, 2024-02-10 — https://example.com/agentic-ai-survey
`,
  sources: MOCK_SOURCES,
  word_count: 612,
  content_type: "essay",
  citation_style: "inline",
  created_at: new Date().toISOString(),
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function* streamMockEvents() {
  const phases = [
    { type: "phase_start",    phase: "brief",      message: "Parsing article brief…",                          ms: 400  },
    { type: "phase_complete", phase: "brief",      message: "Brief saved.",                                    ms: 600  },
    { type: "phase_start",    phase: "research",   message: "Planning and running parallel research…",         ms: 300  },
    { type: "agent_log",      agent: "orchestrator", message: "Identified 5 research angles",                  ms: 500  },
    { type: "agent_log",      agent: "researcher_broad", message: "[web_search] {\"query\": \"transformer architecture large language models\"}", ms: 700 },
    { type: "agent_log",      agent: "researcher_deep",  message: "[web_search] {\"query\": \"agentic AI tool use patterns 2024\"}", ms: 900 },
    { type: "agent_log",      agent: "researcher_broad", message: "[web_fetch] {\"url\": \"https://arxiv.org/abs/1706.03762\"}",    ms: 1100 },
    { type: "agent_log",      agent: "researcher_deep",  message: "[web_fetch] {\"url\": \"https://arxiv.org/abs/2212.08073\"}",    ms: 1200 },
    { type: "agent_log",      agent: "researcher_broad", message: "[web_search] {\"query\": \"scaling laws neural language models Kaplan\"}",   ms: 800  },
    { type: "agent_log",      agent: "researcher_broad", message: "[write_file] {\"path\": \"research/broad.md\"}",                ms: 600  },
    { type: "agent_log",      agent: "researcher_deep",  message: "[write_file] {\"path\": \"research/deep.md\"}",                 ms: 400  },
    { type: "phase_complete", phase: "research",   message: "Research complete — 5 sources found.",            ms: 500  },
    { type: "phase_start",    phase: "synthesis",  message: "Synthesizing research into knowledge map…",       ms: 400  },
    { type: "agent_log",      agent: "synthesizer", message: "[list_files] {\"directory\": \"research\"}",     ms: 600  },
    { type: "agent_log",      agent: "synthesizer", message: "[read_file] {\"path\": \"research/broad.md\"}",  ms: 700  },
    { type: "agent_log",      agent: "synthesizer", message: "[read_file] {\"path\": \"research/deep.md\"}",   ms: 600  },
    { type: "agent_log",      agent: "synthesizer", message: "[write_file] {\"path\": \"state/sources.json\"}", ms: 400 },
    { type: "agent_log",      agent: "synthesizer", message: "[write_file] {\"path\": \"synthesis/knowledge_map.md\"}", ms: 500 },
    { type: "phase_complete", phase: "synthesis",  message: "Synthesis complete.",                             ms: 400  },
    { type: "phase_start",    phase: "outline",    message: "Structuring article outline…",                   ms: 300  },
    { type: "agent_log",      agent: "outliner",   message: "[read_file] {\"path\": \"brief.md\"}",            ms: 500  },
    { type: "agent_log",      agent: "outliner",   message: "[read_file] {\"path\": \"synthesis/knowledge_map.md\"}", ms: 600 },
    { type: "agent_log",      agent: "outliner",   message: "[write_file] {\"path\": \"outline/outline.md\"}", ms: 500  },
    { type: "phase_complete", phase: "outline",    message: "Outline ready — 4 sections.",                    ms: 400  },
    { type: "phase_start",    phase: "writing",    message: "Writing article sections in parallel…",          ms: 300  },
    { type: "agent_log",      agent: "writer_s1",  message: "[read_file] {\"path\": \"outline/outline.md\"}",  ms: 600  },
    { type: "agent_log",      agent: "writer_s2",  message: "[read_file] {\"path\": \"research/broad.md\"}",   ms: 700  },
    { type: "agent_log",      agent: "writer_s3",  message: "[read_file] {\"path\": \"state/sources.json\"}",  ms: 500  },
    { type: "agent_log",      agent: "writer_s1",  message: "[write_file] {\"path\": \"draft/section_01.md\"}", ms: 900 },
    { type: "agent_log",      agent: "writer_s2",  message: "[write_file] {\"path\": \"draft/section_02.md\"}", ms: 800 },
    { type: "agent_log",      agent: "writer_s3",  message: "[write_file] {\"path\": \"draft/section_03.md\"}", ms: 700 },
    { type: "agent_log",      agent: "writer_s4",  message: "[write_file] {\"path\": \"draft/section_04.md\"}", ms: 600 },
    { type: "phase_complete", phase: "writing",    message: "All 4 sections written.",                        ms: 400  },
    { type: "phase_start",    phase: "editing",    message: "Editing and verifying the draft…",               ms: 300  },
    { type: "agent_log",      agent: "editor",     message: "[read_file] {\"path\": \"output/draft_full.md\"}", ms: 700 },
    { type: "agent_log",      agent: "editor",     message: "[read_file] {\"path\": \"state/sources.json\"}",   ms: 500 },
    { type: "agent_log",      agent: "editor",     message: "Verifying factual claims against sources…",       ms: 900 },
    { type: "agent_log",      agent: "editor",     message: "[write_file] {\"path\": \"output/article.md\"}",  ms: 600  },
    { type: "phase_complete", phase: "editing",    message: "Editing complete.",                               ms: 400  },
    { type: "phase_start",    phase: "finalizing", message: "Assembling final output…",                       ms: 300  },
  ];

  for (const { ms, ...event } of phases) {
    await delay(ms);
    yield event;
  }

  await delay(600);
  yield {
    type: "article_ready",
    message: "Article complete!",
    phase: "done",
    data: { article: MOCK_ARTICLE },
  };
}
