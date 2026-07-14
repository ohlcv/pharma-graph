/**
 * ContentLoader — fetches all markdown payloads from `public/content/` via a
 * build-time-generated manifest. Replaces the previous `import.meta.glob`
 * approach that embedded every markdown file into the JS bundle.
 *
 * The manifest is written to public/content-manifest.json by the
 * `pharma-graph:content-manifest` Vite plugin (see vite.config.ts). It is a
 * simple array of relative paths:
 *   { files: ["药学专业知识二/第八章 内分泌系统用药.md", ...], generatedAt: 0 }
 *
 * At boot we fetch the manifest, then fetch every file in parallel. Each
 * fetched text is keyed under its absolute-from-repo path (the original glob
 * shape) so callers that already used `import.meta.glob` paths still work.
 */

const MANIFEST_URL = 'public/content-manifest.json';
// Keys used to match import.meta.glob('../content/**/*.md') shape:
const CONTENT_ROOT = '../../content';

export interface LoadedContent {
  /** Map keyed the same way `import.meta.glob` produced one (relative-to-repo path). */
  files: Record<string, string>;
  /** Number of files loaded — surfaced in console.info diagnostic. */
  count: number;
}

export async function loadContent(): Promise<LoadedContent> {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) {
    throw new Error(`[content-loader] manifest fetch failed: ${res.status} ${res.statusText}`);
  }
  const manifest = (await res.json()) as { files: string[] };
  if (!Array.isArray(manifest.files)) {
    throw new Error('[content-loader] manifest is malformed: missing files[]');
  }

  const responses = await Promise.all(
    manifest.files.map((rel) =>
      fetch('public/content/' + rel).then((r) => {
        if (!r.ok) throw new Error(`[content-loader] ${rel}: ${r.status}`);
        return r.text().then((text) => [rel, text] as const);
      }),
    ),
  );

  // Map to the same shape `import.meta.glob('../../content/**/*.md')` produced
  // — `{ "./foo.md": "...", ... }` — so GraphManager keeps working without
  // any change.
  const files: Record<string, string> = {};
  for (const [rel, text] of responses) {
    const key = `${CONTENT_ROOT}/${rel}`;
    files[key] = text;
  }
  return { files, count: responses.length };
}