import { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";

const CONTENT_TYPES = [
  { value: "essay", label: "Long-form Essay" },
  { value: "technical", label: "Technical Blog Post" },
  { value: "summary", label: "Research Summary" },
  { value: "news", label: "News Article" },
];

const TONES = [
  { value: "analytical", label: "Analytical" },
  { value: "conversational", label: "Conversational" },
  { value: "neutral", label: "Neutral" },
  { value: "opinionated", label: "Opinionated" },
];

const CITATION_STYLES = [
  { value: "inline", label: "Inline Links" },
  { value: "footnote", label: "Footnotes" },
  { value: "apa", label: "APA" },
  { value: "mla", label: "MLA" },
  { value: "chicago", label: "Chicago" },
  { value: "ieee", label: "IEEE" },
];

const LENGTHS = [
  { value: 800, label: "Short (~800 words)" },
  { value: 1500, label: "Medium (~1,500 words)" },
  { value: 2500, label: "Long (~2,500 words)" },
  { value: 4000, label: "Deep (~4,000 words)" },
];

export default function BriefForm({ onSubmit, isLoading }) {
  const [form, setForm] = useState({
    topic: "",
    angle: "",
    content_type: "essay",
    tone: "analytical",
    target_length: 2000,
    citation_style: "inline",
    special_requirements: "",
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.topic.trim()) return;
    onSubmit({
      ...form,
      target_length: Number(form.target_length),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Topic <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.topic}
          onChange={(e) => set("topic", e.target.value)}
          placeholder="e.g. The future of large language models in healthcare"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Specific Angle <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={form.angle}
          onChange={(e) => set("angle", e.target.value)}
          placeholder="e.g. Focus on diagnostic accuracy vs. clinician trust"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Content Type</label>
          <SelectField value={form.content_type} onChange={(v) => set("content_type", v)} options={CONTENT_TYPES} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
          <SelectField value={form.tone} onChange={(v) => set("tone", v)} options={TONES} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Length</label>
          <SelectField
            value={String(form.target_length)}
            onChange={(v) => set("target_length", Number(v))}
            options={LENGTHS.map((l) => ({ ...l, value: String(l.value) }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Citation Style</label>
          <SelectField value={form.citation_style} onChange={(v) => set("citation_style", v)} options={CITATION_STYLES} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Special Requirements <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={form.special_requirements}
          onChange={(e) => set("special_requirements", e.target.value)}
          placeholder="e.g. Include a section on regulatory challenges; avoid jargon; target audience is non-technical executives"
          rows={2}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading || !form.topic.trim()}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium py-3 px-4 rounded-lg transition-colors text-sm"
      >
        <Sparkles size={16} />
        {isLoading ? "Starting…" : "Generate Article"}
      </button>
    </form>
  );
}

function SelectField({ value, onChange, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white pr-8"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}
