import { load } from 'js-yaml';

const regex = /^---(?:\r?\n|\r)(?:([\s\S]*?)(?:\r?\n|\r))?---(?:\r?\n|\r|$)/;

export interface MatterResult {
  data?: unknown;
  stripped?: string;
}

export function matter(source: string): MatterResult {
  const match = regex.exec(source);

  if (match) {
    return {
      data: match[1] ? load(match[1]) : null,
      stripped: source.slice(match[0].length),
    };
  }

  return {};
}
