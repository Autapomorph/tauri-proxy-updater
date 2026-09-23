export interface ParsedFrontmatter {
  content: string;
  meta: Record<string, unknown>;
}

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);

  if (!match) {
    return { content: raw.trim(), meta: {} };
  }

  const frontmatterBlock = match[1];
  const content = match[2].trim();
  const meta: Record<string, unknown> = {};

  for (const line of frontmatterBlock.split('\n')) {
    const trimmed = line.trim();

    if (trimmed && !trimmed.startsWith('#')) {
      const colonIndex = trimmed.indexOf(':');

      if (colonIndex !== -1) {
        const key = trimmed.slice(0, colonIndex).trim();
        let value = trimmed.slice(colonIndex + 1).trim();

        if (value.startsWith('[') && value.endsWith(']')) {
          const items = value
            .slice(1, -1)
            .split(',')
            .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);

          meta[key] = items;
        } else {
          value = value.replace(/^['"]|['"]$/g, '');
          meta[key] = value;
        }
      }
    }
  }

  return { content, meta };
}
