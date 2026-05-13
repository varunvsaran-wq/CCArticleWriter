/**
 * Format a single source into the requested citation style.
 * source: { id, title, url, author, publication, date, type }
 */
export function formatCitation(source, style) {
  const { title, url, author, publication, date } = source;

  const authorStr = author || null;
  const pub = publication || null;
  const dateObj = date ? new Date(date) : null;
  const year = dateObj ? dateObj.getFullYear() : null;
  const monthDay = dateObj
    ? dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric" })
    : null;
  const shortMonth = dateObj
    ? dateObj.toLocaleDateString("en-US", { month: "short" })
    : null;

  switch (style) {
    case "apa": {
      // Author, A. (Year, Month Day). Title. Publication. URL
      const parts = [];
      if (authorStr) parts.push(invertName(authorStr) + ".");
      if (year) parts.push(`(${year}${monthDay ? `, ${monthDay}` : ""}).`);
      parts.push(`${title}.`);
      if (pub) parts.push(`*${pub}*.`);
      if (url) parts.push(url);
      return parts.join(" ");
    }

    case "mla": {
      // Author. "Title." Publication, Date, URL.
      const parts = [];
      if (authorStr) parts.push(invertName(authorStr) + ".");
      parts.push(`"${title}."`);
      if (pub) parts.push(`*${pub}*,`);
      if (dateObj)
        parts.push(
          dateObj.toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }) + ","
        );
      if (url) parts.push(stripProtocol(url) + ".");
      return parts.join(" ");
    }

    case "chicago": {
      // Author. "Title." Publication. Month Day, Year. URL.
      const parts = [];
      if (authorStr) parts.push(invertName(authorStr) + ".");
      parts.push(`"${title}."`);
      if (pub) parts.push(`*${pub}*.`);
      if (dateObj)
        parts.push(
          dateObj.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          }) + "."
        );
      if (url) parts.push(url + ".");
      return parts.join(" ");
    }

    case "ieee": {
      // [N] A. Author, "Title," Publication, Month. Year. [Online]. Available: URL
      const authorIEEE = authorStr ? abbreviateFirst(authorStr) : null;
      const parts = [];
      if (authorIEEE) parts.push(authorIEEE + ",");
      parts.push(`"${title},"`);
      if (pub) parts.push(`*${pub}*,`);
      if (shortMonth && year) parts.push(`${shortMonth}. ${year}.`);
      if (url) parts.push(`[Online]. Available: ${url}`);
      return parts.join(" ");
    }

    case "footnote":
    case "inline":
    default: {
      // Simple: Title — Publication, Date — URL
      const parts = [title];
      if (pub) parts.push(pub);
      if (date) parts.push(date);
      return parts.join(" — ");
    }
  }
}

/**
 * Replace [N] markers in article content with styled superscript HTML.
 * Returns the content with markers wrapped in <sup> tags.
 */
export function injectCitationMarkers(content) {
  return content.replace(/\[(\d+)\]/g, (_, n) => {
    return `<sup class="citation-marker" data-ref="${n}">[${n}]</sup>`;
  });
}

/**
 * Rewrite the ## References section in article content
 * using the given sources array and citation style.
 */
export function rewriteReferences(content, sources, style) {
  if (!sources || sources.length === 0) return content;

  const refSection = sources
    .map((s, i) => {
      const formatted = formatCitation(s, style);
      if (style === "inline") {
        return `[${i + 1}] [${s.title}](${s.url}) — ${formatted}`;
      }
      return `[${i + 1}] ${formatted}`;
    })
    .join("\n\n");

  const refHeader = "## References";
  const idx = content.indexOf(refHeader);
  if (idx !== -1) {
    return content.slice(0, idx) + refHeader + "\n\n" + refSection;
  }
  return content + "\n\n" + refHeader + "\n\n" + refSection;
}

// ── helpers ──────────────────────────────────────────

function invertName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts.pop();
  return `${last}, ${parts.join(" ")}`;
}

function abbreviateFirst(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts.pop();
  const initials = parts.map((p) => p[0].toUpperCase() + ".").join(" ");
  return `${initials} ${last}`;
}

function stripProtocol(url) {
  return url.replace(/^https?:\/\//, "");
}
