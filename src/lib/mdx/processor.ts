import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkRehype, { type Options as RemarkRehypeOptions } from 'remark-rehype';
import { type PluggableList, unified } from 'unified';
import { remarkMarkAndUnravel } from './remark-mark-and-unravel';

export interface CreateProcessorOptions {
  remarkPlugins?: PluggableList;
  rehypePlugins?: PluggableList;
  remarkRehypeOptions?: RemarkRehypeOptions;
}

export type CreateProcessorResult = ReturnType<typeof createProcessor>;

export function createProcessor({ remarkPlugins = [], rehypePlugins = [], remarkRehypeOptions = {} }: CreateProcessorOptions = {}) {
  return unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkPlugins)
    .use(remarkMarkAndUnravel)
    .use(remarkRehype, {
      ...remarkRehypeOptions,
      allowDangerousHtml: true,
      passThrough: [
        ...(remarkRehypeOptions.passThrough || []),
        /**
         * List of node types made by `mdast-util-mdx`, which have to be passed
         * through untouched from the mdast tree to the hast tree.
         */
        'mdxFlowExpression',
        'mdxJsxFlowElement',
        'mdxJsxTextElement',
        'mdxTextExpression',
        'mdxjsEsm',
      ],
    })
    .use(rehypePlugins);
}
