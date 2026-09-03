// src/ui/markdown.ts
// Render markdown for the node detail panel. Sanitized against XSS via
// DOMPurify. Image paths are rewritten so `./foo.png` next to the source
// .md resolves against the public `/content/.../<dir>/` URL the loader
// fetched from.

import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true, // tables, strikethrough, task lists
  breaks: false, // md line breaks stay paragraph-breaks; don't double <br>
});

const SAFE_ATTR = ['target', 'rel', 'src', 'href', 'alt', 'title', 'class'];
const SAFE_TAGS = [
  'a',
  'p',
  'mark', // 高亮文本
  'span',
  'div',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'b',
  'i',
  's',
  'del',
  'u',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'code',
  'pre',
  'kbd',
  'samp',
  'blockquote',
  'img',
  'input', // task list checkboxes (gfm)
];

/**
 * Resolve an image src relative to the source markdown file's directory.
 * `sourceUrl` is the manifest path, e.g.
 *   `药学专业知识二/第一章 .../第六节 抗帕金森病药/COMT抑制剂.md`
 *
 * Rules:
 *   - `https?://...` → unchanged
 *   - `data:image/...` → unchanged
 *   - `/foo/bar.png` → unchanged (treated as absolute site-root path)
 *   - `./foo.png` or `foo.png` → join with the source file's parent dir,
 *     producing `/content/<dir>/foo.png`
 *   - Anything else → unchanged (best-effort)
 */
function rewriteImageSrc(src: string, sourceUrl: string): string {
  if (!src) return src;
  if (/^(https?:|data:)/i.test(src)) return src;
  if (src.startsWith('/')) return src;
  // Build a directory URL for the source file: strip trailing filename
  // segment, normalise `..`, prefix `/content/`.
  const parts = sourceUrl.split('/').filter(Boolean);
  parts.pop(); // drop filename
  const dirParts = parts.map((p) => (p === '..' ? '' : p));
  if (src.startsWith('./')) src = src.slice(2);
  const joined = [...dirParts, ...src.split('/')]
    .filter((p, i, arr) => p !== '' || i === arr.length - 1)
    .join('/');
  return '/content/' + joined;
}

function rewriteImageAttrs(html: string, sourceUrl: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (full, attrs: string) => {
    const srcMatch = attrs.match(/\bsrc=("([^"]*)"|'([^']*)')/i);
    if (!srcMatch) return full;
    const raw = (srcMatch[2] ?? srcMatch[3] ?? '').trim();
    const resolved = rewriteImageSrc(raw, sourceUrl);
    const replaced = attrs.replace(
      /\bsrc=("([^"]*)"|'([^']*)')/i,
      (m, q, a, b) => `src="${resolved}"`,
    );
    return `<img${replaced}>`;
  });
}

/**
 * Render a markdown string to safe HTML, with relative image paths
 * resolved against the source file's directory.
 *
 * `sourceUrl` is the manifest-style relative path
 * (e.g. `药学专业知识二/.../COMT抑制剂.md`); pass empty string when the
 * caller has no file context (e.g. summary from frontmatter only).
 */
export function renderMarkdown(text: string, sourceUrl = ''): string {
  if (!text || !text.trim()) return '';
  const rawHtml = marked.parse(text, { async: false }) as string;
  const withImages = sourceUrl ? rewriteImageAttrs(rawHtml, sourceUrl) : rawHtml;
  return DOMPurify.sanitize(withImages, {
    ALLOWED_TAGS: SAFE_TAGS,
    ALLOWED_ATTR: SAFE_ATTR,
    USE_PROFILES: { html: true },
    // Block javascript: URLs even if DOMPurify would otherwise let them slip
    // through an `a[href]`. Same goes for `formaction` on inputs.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:]|$))/i,
  });
}
