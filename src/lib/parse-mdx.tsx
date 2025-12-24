import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import remarkGfm from 'remark-gfm';
import  { createParser, type PluggableList } from './mdx';
import { highlighter } from './shiki/workerd';

export const rehypePlugins: PluggableList = [
  [
    rehypeAutolinkHeadings,
    {
      behavior: 'wrap',
    },
  ],
  [
    rehypeShikiFromHighlighter,
    highlighter,
    {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      addLanguageClass: true,
    },
  ],
];

export const remarkPlugins: PluggableList = [remarkGfm];

export const parse = createParser({
  remarkPlugins,
  rehypePlugins,
});
