import katex from "katex";

// ── Markdown → LaTeX ────────────────────────────────────────────────

const LATEX_SPECIALS = /([&%$#_{}~^\\])/g;

function escapeLatex(text) {
  // Escape LaTeX special chars (except inside math, which we handle separately)
  return text.replace(LATEX_SPECIALS, (c) => {
    switch (c) {
      case "\\": return "\\textbackslash{}";
      case "~": return "\\textasciitilde{}";
      case "^": return "\\textasciicircum{}";
      default:  return `\\${c}`;
    }
  });
}

/**
 * Convert article markdown to a complete LaTeX document.
 * Handles the subset of constructs the writer agents produce.
 */
export function markdownToLatex(md, title = "Article") {
  if (!md) md = "";

  // Pull out math + code spans up front so we don't mangle them with escapes
  const placeholders = [];
  const stash = (s) => {
    placeholders.push(s);
    return `@@PH${placeholders.length - 1}@@`;
  };

  let src = md;

  // Fenced code blocks → verbatim
  src = src.replace(/```([a-zA-Z0-9]*)\n([\s\S]*?)```/g, (_, _lang, body) =>
    stash(`\\begin{verbatim}\n${body}\n\\end{verbatim}`)
  );

  // Inline code
  src = src.replace(/`([^`\n]+)`/g, (_, body) => stash(`\\texttt{${escapeLatex(body)}}`));

  // Display math $$...$$
  src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => stash(`\\[${formula}\\]`));

  // Inline math $...$  (avoid matching across newlines / over too much text)
  src = src.replace(/\$([^\$\n]{1,200}?)\$/g, (_, formula) => stash(`\\(${formula}\\)`));

  // Headings
  src = src.replace(/^#{4,}\s+(.+)$/gm, (_, t) => `\\paragraph*{${escapeLatex(t)}}`);
  src = src.replace(/^###\s+(.+)$/gm, (_, t) => `\\subsubsection*{${escapeLatex(t)}}`);
  src = src.replace(/^##\s+(.+)$/gm, (_, t) => `\\section*{${escapeLatex(t)}}`);
  src = src.replace(/^#\s+(.+)$/gm, (_, t) => `\\section*{${escapeLatex(t)}}`);

  // Bold / italic (order matters: **bold** before *italic*)
  src = src.replace(/\*\*([^*\n]+)\*\*/g, (_, t) => `\\textbf{${escapeLatex(t)}}`);
  src = src.replace(/\*([^*\n]+)\*/g, (_, t) => `\\textit{${escapeLatex(t)}}`);
  src = src.replace(/_([^_\n]+)_/g, (_, t) => `\\textit{${escapeLatex(t)}}`);

  // Links [text](url)
  src = src.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, text, url) => `\\href{${url}}{${escapeLatex(text)}}`
  );

  // Bulleted lists (consecutive lines)
  src = src.replace(/((?:^[ \t]*[-*+]\s+.+(?:\n|$))+)/gm, (block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map((line) => "  \\item " + escapeLatex(line.replace(/^[ \t]*[-*+]\s+/, "")))
      .join("\n");
    return `\\begin{itemize}\n${items}\n\\end{itemize}\n`;
  });

  // Numbered lists
  src = src.replace(/((?:^[ \t]*\d+\.\s+.+(?:\n|$))+)/gm, (block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map((line) => "  \\item " + escapeLatex(line.replace(/^[ \t]*\d+\.\s+/, "")))
      .join("\n");
    return `\\begin{enumerate}\n${items}\n\\end{enumerate}\n`;
  });

  // Block quotes (single-line — multi-line gets merged)
  src = src.replace(/((?:^>\s?.*\n?)+)/gm, (block) => {
    const inner = block
      .trim()
      .split(/\n/)
      .map((l) => escapeLatex(l.replace(/^>\s?/, "")))
      .join(" ");
    return `\\begin{quote}\n${inner}\n\\end{quote}\n`;
  });

  // Horizontal rules
  src = src.replace(/^---+\s*$/gm, "\\hrulefill");

  // Citation markers [N] stay as-is — natural LaTeX-compatible labels.

  // Escape remaining plain-text specials (we already pulled math/code out)
  // Skip lines that begin with a LaTeX command to avoid double-escaping
  src = src
    .split("\n")
    .map((line) => {
      if (/^\s*\\(begin|end|section|subsection|subsubsection|paragraph|item|href|textbf|textit|texttt|hrulefill)/.test(line)) {
        return line;
      }
      return escapeRemainingSpecials(line);
    })
    .join("\n");

  // Restore stashed math/code/etc.
  src = src.replace(/@@PH(\d+)@@/g, (_, i) => placeholders[Number(i)] || "");

  return `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{hyperref}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage[margin=1in]{geometry}
\\usepackage{enumitem}
\\setlength{\\parskip}{0.5em}
\\setlength{\\parindent}{0pt}

\\title{${escapeLatex(title || "Article")}}
\\date{}

\\begin{document}
\\maketitle

${src.trim()}

\\end{document}
`;
}

// Escape only what's still risky in plain prose (omits backslash since we use it for commands above)
function escapeRemainingSpecials(text) {
  return text.replace(/([&%$#_{}~^])/g, (c) => {
    switch (c) {
      case "~": return "\\textasciitilde{}";
      case "^": return "\\textasciicircum{}";
      default:  return `\\${c}`;
    }
  });
}

// ── LaTeX → HTML preview ───────────────────────────────────────────

/**
 * Render LaTeX source as HTML for in-browser preview.
 * Handles the subset we generate; math runs through KaTeX.
 */
export function renderLatexToHtml(tex) {
  if (!tex) return "";

  // Strip preamble + \end{document}
  let body = tex;
  const docStart = body.indexOf("\\begin{document}");
  if (docStart >= 0) body = body.slice(docStart + "\\begin{document}".length);
  const docEnd = body.indexOf("\\end{document}");
  if (docEnd >= 0) body = body.slice(0, docEnd);

  // Pull out math first so other replacements don't munge braces inside
  const tokens = [];
  const stash = (html) => {
    tokens.push(html);
    return `@@TOK${tokens.length - 1}@@`;
  };

  const renderMath = (formula, displayMode) => {
    try {
      return katex.renderToString(formula, { displayMode, throwOnError: false });
    } catch {
      const dollar = displayMode ? "$$" : "$";
      return `<code>${escapeHtml(dollar + formula + dollar)}</code>`;
    }
  };

  body = body.replace(/\\\[([\s\S]+?)\\\]/g, (_, f) => stash(renderMath(f, true)));
  body = body.replace(/\\\(([\s\S]+?)\\\)/g, (_, f) => stash(renderMath(f, false)));
  body = body.replace(/\$\$([\s\S]+?)\$\$/g, (_, f) => stash(renderMath(f, true)));
  body = body.replace(/\$([^\$\n]+?)\$/g, (_, f) => stash(renderMath(f, false)));

  // Verbatim → pre/code
  body = body.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, (_, code) =>
    stash(`<pre><code>${escapeHtml(code.replace(/^\n/, ""))}</code></pre>`)
  );

  // Title / maketitle
  let titleHtml = "";
  body = body.replace(/\\title\{([^}]+)\}/g, (_, t) => {
    titleHtml = `<h1>${escapeHtml(t)}</h1>`;
    return "";
  });
  body = body.replace(/\\date\{[^}]*\}/g, "");
  body = body.replace(/\\maketitle/g, () => stash(titleHtml));

  // Headings
  body = body.replace(/\\section\*?\{([^}]+)\}/g, (_, t) => `<h2>${escapeHtml(t)}</h2>`);
  body = body.replace(/\\subsection\*?\{([^}]+)\}/g, (_, t) => `<h3>${escapeHtml(t)}</h3>`);
  body = body.replace(/\\subsubsection\*?\{([^}]+)\}/g, (_, t) => `<h4>${escapeHtml(t)}</h4>`);
  body = body.replace(/\\paragraph\*?\{([^}]+)\}/g, (_, t) => `<p><strong>${escapeHtml(t)}</strong></p>`);

  // Inline markup
  body = body.replace(/\\textbf\{([^}]+)\}/g, (_, t) => `<strong>${escapeHtml(t)}</strong>`);
  body = body.replace(/\\textit\{([^}]+)\}/g, (_, t) => `<em>${escapeHtml(t)}</em>`);
  body = body.replace(/\\emph\{([^}]+)\}/g, (_, t) => `<em>${escapeHtml(t)}</em>`);
  body = body.replace(/\\texttt\{([^}]+)\}/g, (_, t) => `<code>${escapeHtml(t)}</code>`);
  body = body.replace(
    /\\href\{([^}]+)\}\{([^}]+)\}/g,
    (_, url, text) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
  );
  body = body.replace(/\\url\{([^}]+)\}/g, (_, url) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);

  // Lists
  body = body.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, inner) => {
    const items = inner
      .split(/\\item\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `<li>${escapeHtml(s)}</li>`)
      .join("");
    return stash(`<ul>${items}</ul>`);
  });
  body = body.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, inner) => {
    const items = inner
      .split(/\\item\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `<li>${escapeHtml(s)}</li>`)
      .join("");
    return stash(`<ol>${items}</ol>`);
  });
  body = body.replace(/\\begin\{quote\}([\s\S]*?)\\end\{quote\}/g, (_, inner) =>
    stash(`<blockquote>${escapeHtml(inner.trim())}</blockquote>`)
  );

  body = body.replace(/\\hrulefill/g, () => stash("<hr>"));
  body = body.replace(/\\\\/g, () => stash("<br>"));
  body = body.replace(/\\par\b/g, "\n\n");

  // Unescape LaTeX special-char escapes (\&, \$, \%, \#, \_, \{, \})
  body = body.replace(/\\([&%$#_{}])/g, "$1");
  body = body.replace(/\\textbackslash\{\}/g, "\\");
  body = body.replace(/\\textasciitilde\{\}/g, "~");
  body = body.replace(/\\textasciicircum\{\}/g, "^");

  // Anything else: strip remaining unknown commands but keep their argument text
  body = body.replace(/\\[a-zA-Z]+\*?\{([^{}]*)\}/g, "$1");
  body = body.replace(/\\[a-zA-Z]+\*?/g, "");

  // Now wrap text in paragraphs (split on blank lines)
  body = body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      // Already block-level (token placeholder or starts with HTML block tag)
      if (/^@@TOK\d+@@$/.test(chunk)) return chunk;
      if (/^<(h[1-6]|ul|ol|blockquote|pre|hr|p|div|table)/i.test(chunk)) return chunk;
      return `<p>${chunk.replace(/\n/g, " ")}</p>`;
    })
    .join("\n");

  // Restore stashed HTML tokens
  body = body.replace(/@@TOK(\d+)@@/g, (_, i) => tokens[Number(i)] || "");

  return body;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
