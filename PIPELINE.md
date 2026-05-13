# Pipeline — State Machine & Decision Points

## Overview

The pipeline is a directed graph with feedback edges. The Orchestrator drives transitions between phases by reading state files and evaluating quality gates. This mirrors how Claude Code checks tool output before deciding the next action — each phase transition is a deliberate decision, not an automatic handoff.

---

## Phase Diagram

```
START
  │
  ▼
[BRIEF PARSING]
  │  Parse article request into structured brief
  │  Extract: topic, angle, target length, tone, deadline
  │  Write: brief.md, state/todos.json
  │
  ▼
[RESEARCH PLANNING]
  │  Orchestrator decomposes topic into search angles
  │  Creates research todos (broad, deep-dive, specific claims)
  │  Assigns angles to parallel research agents
  │
  ├──────────────────────────────────────────┐
  ▼                                          ▼
[RESEARCH A: BROAD SWEEP]          [RESEARCH B: DEEP DIVE]
  │  Goal: coverage, key claims,     │  Goal: expert sources,
  │  recent developments              │  data, primary sources,
  │  Tools: web_search × N            │  counter-arguments
  │  Output: research/broad.md        │  Tools: web_fetch, web_search
  │                                   │  Output: research/deep.md
  └──────────────┬────────────────────┘
                 │
                 ▼
         [SYNTHESIS]
                 │  Read all research files
                 │  Build knowledge map (themes, facts, conflicts, gaps)
                 │  Score source credibility
                 │  Write: synthesis/knowledge_map.md, state/gaps.json
                 │
          ┌──────┴──────┐
          │             │
    gaps found?      no gaps
          │             │
          ▼             │
  [RESEARCH LOOP]       │
    Spawn targeted      │
    research agents     │
    for each gap        │
    (max 2 rounds)      │
          │             │
          └──────┬──────┘
                 │
                 ▼
         [OUTLINING]
                 │  Read synthesis + brief
                 │  Generate section structure
                 │  Assign sources to sections
                 │  Identify argument flow / narrative arc
                 │  Write: outline/outline.md
                 │
                 ▼
         [SECTION WRITING]  ◀──────────────────────┐
                 │  Spawn one Writer Agent per section  │
                 │  (parallel after outline is stable)  │
                 │  Each agent receives:                │
                 │    - Its section outline entry       │
                 │    - Relevant source excerpts         │
                 │    - Adjacent sections for coherence │
                 │  Write: draft/section_NN.md           │
                 │                                      │
                 ▼                                      │
         [ASSEMBLY]                                     │
                 │  Concatenate sections in order       │
                 │  Check transitions between sections  │
                 │  Write: output/draft_full.md          │
                 │                                      │
                 ▼                                      │
         [EDITING]                                      │
                 │  Editor Agent reads full draft        │
                 │    + all source files                 │
                 │    + original brief                   │
                 │  Checks:                              │
                 │    - Factual accuracy vs sources      │
                 │    - Coherence and argument flow      │
                 │    - Style consistency                │
                 │    - Citations present                │
                 │    - Brief requirements met           │
                 │                                      │
          ┌──────┴──────┐                               │
          │             │                               │
    issues found?    no issues                          │
          │             │                               │
          ▼             │                               │
  [REWRITE REQUESTS]    │                               │
    Editor writes       │                               │
    targeted feedback   │                               │
    per section         │                               │
    (max 2 rounds) ─────┘──────────────────────────────┘
                        │
                        ▼
                  [FINAL OUTPUT]
                        │  Polish transitions
                        │  Format citations
                        │  Write: output/article.md
                        │
                       END
```

---

## Phase Specifications

### Phase 1: Brief Parsing

**Input**: Raw user request (string)

**Agent**: Orchestrator (inline, no sub-agent)

**Process**:
1. Extract structured fields from the brief
2. Set defaults for missing fields (tone, length, citation style)
3. Initialize todos and source tracking

**Output** (`brief.md`):
```
topic: <main topic>
angle: <specific angle or thesis>
content_type: <essay|technical|summary|news>
target_length: <word count range>
tone: <analytical|conversational|neutral|opinionated>
citation_style: <inline|footnote|endnote|none>
deadline: <date if given>
special_requirements: <any constraints>
```

**Gate to next phase**: Brief is parseable and topic is scoped enough to research.

---

### Phase 2: Research Planning

**Input**: `brief.md`

**Agent**: Orchestrator

**Process**:
1. Decompose topic into 3–7 distinct search angles
2. Identify specific claims that need verification
3. Identify likely counter-arguments to research
4. Create parallel research assignments

**Output** (`state/todos.json`):
```json
{
  "research": [
    { "id": "R1", "angle": "...", "agent": "A", "status": "pending" },
    { "id": "R2", "angle": "...", "agent": "B", "status": "pending" }
  ],
  "sections": [],
  "open_questions": []
}
```

---

### Phase 3: Research (Parallel)

**Input**: Assigned search angle, brief context

**Agent**: Research Agent (A = broad, B = deep-dive)

**Tools available**:
- `web_search(query)` — returns search results with snippets
- `web_fetch(url)` — fetches full page content
- `extract_quotes(url, topic)` — pulls relevant quotes from a page

**Process** (observe → decide → act loop):
```
1. Formulate initial search queries (3-5 different phrasings)
2. FOR each query:
   a. Call web_search
   b. Observe: which results look credible and relevant?
   c. Decide: which URLs to fetch in full?
   d. Call web_fetch on selected URLs
   e. Extract key claims, data points, quotes
   f. Note source metadata (author, date, publication, credibility signals)
3. Assess: are there obvious gaps? If yes, run additional targeted searches.
4. Write research notes file with structured output.
```

**Output** (`research/broad.md` or `research/deep.md`):
```markdown
## Search Angle: [angle description]

### Key Claims Found
- [claim] — Source: [title], [url], [date]

### Data & Statistics
- [stat] — Source: [title], [url]

### Expert Quotes
> [quote] — [author], [publication], [date]

### Counter-arguments / Alternative Views
- [view] — Source: [title], [url]

### Source Credibility Notes
| URL | Publication | Author | Date | Credibility |
|-----|-------------|--------|------|-------------|
...

### Open Questions (gaps)
- [question that couldn't be answered]
```

**Quality gate**: At least 3 credible sources found; at least 1 primary or authoritative source.

---

### Phase 4: Synthesis

**Input**: All `research/*.md` files, `brief.md`

**Agent**: Synthesis Agent

**Tools available**:
- `read_file(path)` — reads research files
- `write_file(path, content)` — writes synthesis output

**Process**:
1. Read all research files
2. Identify recurring themes across sources
3. Flag contradictions between sources
4. Map claims to confidence levels (single-source vs. multi-source)
5. Score each source for credibility
6. Identify open questions / gaps
7. Build knowledge map organized by article theme

**Output** (`synthesis/knowledge_map.md`):
```markdown
## Core Thesis (derived from research)
[Emergent thesis based on evidence]

## High-Confidence Facts (3+ sources)
- [fact]

## Medium-Confidence Claims (1–2 sources)
- [claim] — needs additional support

## Source Conflicts
- Topic: [topic] — Source A says [X], Source B says [Y]

## Knowledge Gaps
- [question] — critical for article? [yes/no]

## Best Sources by Theme
- Theme 1: [source list]
- Theme 2: [source list]
```

**Gap handling**: If `gaps.json` contains critical gaps, signal Orchestrator to spawn additional research agents. Non-critical gaps are noted but don't block progress.

---

### Phase 5: Outlining

**Input**: `synthesis/knowledge_map.md`, `brief.md`

**Agent**: Outline Agent

**Process**:
1. Choose structure appropriate to content type (see matrix below)
2. Map synthesis themes to sections
3. Assign primary and secondary sources to each section
4. Define the narrative arc / argument flow
5. Estimate word count per section

**Structure patterns by content type**:

| Content Type | Structure |
|---|---|
| Long-form essay | Hook → Context → Thesis → Body (3-5 arguments) → Counter-argument → Conclusion |
| Technical blog | Problem → Why It Matters → Solution Overview → Implementation → Examples → Takeaways |
| Research summary | Executive Summary → Methodology → Findings → Analysis → Implications → Limitations |
| News | Headline → Lede → Key Facts → Context → Quotes → Background → What's Next |

**Output** (`outline/outline.md`):
```markdown
## Article: [title]

**Angle**: [thesis/angle]
**Total target**: [word count]

---

### Section 1: [title]
**Purpose**: [what this section accomplishes]
**Word target**: [N words]
**Key points**:
  - [point 1]
  - [point 2]
**Primary sources**: [source IDs]
**Transition to next**: [brief note]

### Section 2: [title]
...
```

---

### Phase 6: Section Writing (Parallel)

**Input** (per Writer Agent):
- Its section's outline entry
- Relevant source excerpts from `research/*.md`
- The previous section's final paragraph (for continuity)
- Tone and style from `brief.md`

**Agent**: Writer Agent (one per section, run in parallel)

**Tools available**:
- `read_file(path)` — reads source and outline files
- `web_fetch(url)` — re-fetches a source for an exact quote if needed

**Process**:
1. Read the section outline entry
2. Read assigned source excerpts
3. Draft the section following the outline
4. Integrate evidence and quotes naturally
5. Write the transition sentence to the next section

**Output** (`draft/section_NN.md`): Finished prose for that section, with inline citations.

---

### Phase 7: Editing

**Input**: `output/draft_full.md`, all `research/*.md`, `brief.md`

**Agent**: Editor Agent

**Checklist** (modeled after Claude Code's verification before "done"):
- [ ] Every factual claim traceable to a source file
- [ ] No claims present in draft that aren't in research
- [ ] Argument flows logically section to section
- [ ] Tone is consistent with brief
- [ ] Target word count ±10%
- [ ] All citations formatted correctly
- [ ] Hook is strong; conclusion is decisive
- [ ] Technical terms explained at appropriate level

**Output**:
- If clean: `output/article.md` (final)
- If issues: `state/editor_feedback.json` — per-section rewrite requests sent back to Writer Agents (max 2 rounds)

---

## Feedback Loop Limits

| Loop | Max Rounds | Reason |
|---|---|---|
| Research gap filling | 2 | Avoid infinite search spirals |
| Editor → Writer rewrites | 2 | Diminishing returns after 2 passes |
| Source credibility retries | 1 | If a source is bad, find another |

---

## Orchestrator Decision Logic

```python
# Pseudocode — actual implementation uses Claude API tool calls

def run_pipeline(brief: str):
    parse_brief(brief)
    
    research_angles = plan_research()
    
    # Parallel research
    results = parallel([
        run_research_agent("broad", angles[:len//2]),
        run_research_agent("deep",  angles[len//2:])
    ])
    
    gaps = run_synthesis()
    
    # Research loop (max 2 rounds)
    for _ in range(2):
        if not gaps.critical:
            break
        run_research_agent("targeted", gaps.critical)
        gaps = run_synthesis()
    
    run_outlining()
    
    sections = read_outline_sections()
    
    # Parallel section writing
    parallel([run_writer_agent(s) for s in sections])
    
    assemble_draft()
    
    # Edit loop (max 2 rounds)
    for _ in range(2):
        feedback = run_editor()
        if not feedback.rewrites:
            break
        parallel([run_writer_agent(s) for s in feedback.rewrites])
        assemble_draft()
    
    finalize_output()
```
