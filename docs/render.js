import { marked } from "./vendor/marked/marked.esm.js";
import DOMPurify from "./vendor/dompurify/purify.es.mjs";
import { safeImageFile } from './core.js?v=links1';

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function canonicalMathExpression(value) {
  const subscriptDigits = { "₀":"0", "₁":"1", "₂":"2", "₃":"3", "₄":"4", "₅":"5", "₆":"6", "₇":"7", "₈":"8", "₉":"9" };
  let text = String(value || "").trim()
    .replace(/([A-Za-zΑ-Ωα-ω])([₀₁₂₃₄₅₆₇₈₉]+)/g, (_all, symbol, digits) => `${symbol}_${[...digits].map((digit) => subscriptDigits[digit]).join("")}`)
    // TeX commands consume following letters: πa must become \pi a, not \pia.
    .replace(/([θλπΔ])(?=[A-Za-z])/g, "$1 ")
    .replaceAll("θ", "\\theta").replaceAll("λ", "\\lambda")
    .replaceAll("π", "\\pi").replaceAll("Δ", "\\Delta")
    .replace(/\bn([012])\b/g, "n_$1")
    .replaceAll("²", "^2").replaceAll("³", "^3")
    .replaceAll("≈", "\\approx ").replaceAll("≤", "\\le ").replaceAll("≥", "\\ge ")
    .replaceAll("×", "\\times ").replaceAll("÷", "\\div ")
    .replace(/(^|[^\\\w])(arcsin|sin|cos|tan)\b/g, "$1\\$2")
    .replace(/(^|[^\\])sqrt\(([^()]+)\)/gi, "$1\\sqrt{$2}")
    .replace(/√\(([^()]+)\)/g, "\\sqrt{$1}")
    .replace(/(\d+(?:\.\d+)?)\s*(?:度|°)/g, "$1^{\\circ}");
  return text.replace(/\s+/g, " ").trim();
}
function isObviousMath(value) {
  // Keep identifiers, assignments and ordinary code intact. Ambiguous ASCII
  // expressions need explicit $ delimiters; an underscore alone is not math.
  if (!/[≈≠≤≥±×÷√∑∫°]|\\(?:frac|sqrt|sin|cos|tan|arcsin)\b/.test(value)) return false;
  const operands = value.replace(/\\(?:frac|sqrt|sin|cos|tan|arcsin|theta|lambda|pi|Delta|approx|le|ge|times|div|circ)\b/g, "")
    .replace(/\b(?:arcsin|sin|cos|tan|sqrt)\b/g, "");
  return /[\dA-Za-zΑ-Ωα-ω]/.test(value)
    && !/[A-Za-z]{3,}|[A-Za-z0-9]_[A-Za-z]{2,}/.test(operands)
    && !/[^\s\dA-Za-zΑ-Ωα-ω₀-₉²³≈≠≤≥±×÷√∑∫°度_{}()\[\].,+\-*/=^<>]/.test(operands);
}
function mathWithReferences(value) {
  // Source citations are Markdown links, not TeX. AI notes sometimes put
  // them inside \text{}, where the fragment's # becomes a TeX parameter.
  const reference = /\[([^\]\r\n]+)\]\((#source-\d+)\)/g;
  let text = String(value).replace(/\\(?:text|textrm|textnormal)\{([^{}]*)\}/g, (raw, body) => {
    const remainder = body.replace(reference, "").replace(/[\s,，、;；]/g, "");
    return !remainder && body !== body.replace(reference, "") ? body.match(reference).join(" ") : raw;
  });
  // KaTeX supports the array alignment but not TeX's intercolumn @ spacing.
  // Only remove spacing directives; @{=} and other inserted values are kept.
  text = text.replace(/\\begin\{array\}\{((?:[lcr|\s]|@\{\\(?:quad|qquad|enspace)\})+)\}/g,
    (_raw, columns) => `\\begin{array}{${columns.replace(/@\{\\(?:quad|qquad|enspace)\}/g, "")}}`);
  const links = [], seen = new Set();
  text = text.replace(reference, (_raw, label, href) => {
    if (!seen.has(href)) {
      links.push(`<a href="${href}">${escape(label)}</a>`);
      seen.add(href);
    }
    return "";
  }).trim().replace(/(?:\\(?:quad|qquad|enspace)\s*)+$/, "").trim();
  return { text, citations: links.length ? ` <span class="math-citations">${links.join("、")}</span>` : "" };
}
function mathHtml(text, displayMode) {
  const math = mathWithReferences(text);
  try { return window.katex.renderToString(math.text, { displayMode, throwOnError: false, trust: false, strict: "ignore", maxExpand: 500 }) + math.citations; }
  catch { return `<code>${escape(math.text)}</code>` + math.citations; }
}
let imageAssets = new Map(), imageElements = [];
marked.use({ gfm: true, breaks: false, renderer: { image(token) {
  const asset = imageAssets.get(token.href);
  if (!asset || !safeImageFile(token.href)) return `<span class="image-unavailable">〔配图未包含在当前发布版本中〕</span>`;
  const dimensions = Number.isInteger(asset.width) && Number.isInteger(asset.height) && asset.width > 0 && asset.height > 0
    ? ` width="${asset.width}" height="${asset.height}"` : '';
  const position = imageElements.length;
  imageElements.push(`<img class="note-image" src="${escape(token.href)}" alt="${escape(token.text || '课堂配图')}"${dimensions} loading="lazy" decoding="async" tabindex="0">`);
  return `<span data-note-image="${position}"></span>`;
} }, extensions: [
  // Render legacy AI formula formatting without changing token.raw. Fenced
  // and indented code never enter these inline renderers.
  { name: "codespan", renderer(token) {
    return /^`[^`]/.test(token.raw) && !token.raw.includes("\n") && isObviousMath(token.text)
      ? mathHtml(canonicalMathExpression(token.text), false) : false;
  } },
  { name: "strong", renderer(token) {
    return isObviousMath(token.text) ? mathHtml(canonicalMathExpression(token.text), false) : false;
  } },
  { name: "blockMath", level: "block", start: (src) => src.search(/\$\$|\\\[/),
    tokenizer(src) {
      // End at the first closing delimiter, including when a citation or
      // punctuation follows it. Never consume later formulas to find a newline.
      const match = /^(?: {0,3}\$\$([\s\S]+?)\$\$| {0,3}\\\[([\s\S]+?)\\\])/.exec(src);
      if (match) return { type: "blockMath", raw: match[0], text: (match[1] || match[2]).trim() };
    }, renderer: (token) => mathHtml(token.text, true) },
  { name: "inlineMath", level: "inline", start(src) { return src.search(/\$|\\\(/); },
    tokenizer(src) {
      const match = /^(?:\$\$([^\n]+?)\$\$|\$((?:\\.|[^$\n])+?)\$|\\\(([^\n]+?)\\\))/.exec(src);
      if (match) return { type: "inlineMath", raw: match[0], text: match[1] || match[2] || match[3], display: Boolean(match[1]) };
    }, renderer: (token) => mathHtml(token.text, token.display) },
] });

export function renderMarkdown(markdown, assets = []) {
  imageAssets = new Map((Array.isArray(assets) ? assets : []).map(asset => [asset.src, asset]));
  imageElements = [];
  const safe = DOMPurify.sanitize(marked.parse(String(markdown || "")), {
    FORBID_TAGS: ["style", "iframe", "form", "input", "img", "audio", "video", "source", "object", "embed"], FORBID_ATTR: ["autofocus"],
  });
  return safe.replace(/<span data-note-image="(\d+)"><\/span>/g, (_raw, index) => imageElements[Number(index)] || '');
}
