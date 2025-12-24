import type {
  Expression,
  JSXAttribute,
  JSXElement,
  JSXExpressionContainer,
  JSXFragment,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  JSXSpreadAttribute,
  JSXSpreadChild,
  JSXText,
  Literal,
  Program,
} from 'estree-jsx';
import type { ElementContent, Node, Root } from 'hast';
import type { MdxFlowExpressionHast } from 'mdast-util-mdx-expression';
import type { MdxJsxAttribute, MdxJsxAttributeValueExpression, MdxJsxExpressionAttribute, MdxJsxFlowElementHast } from 'mdast-util-mdx-jsx';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkRehype, { type Options as RemarkRehypeOptions } from 'remark-rehype';
import { type PluggableList, unified } from 'unified';
import { type BuildVisitor, visit } from 'unist-util-visit';
import { remarkMarkAndUnravel } from './remark-mark-and-unravel';

const expressionToProgram = (expression: Expression): Program => {
  return {
    type: 'Program',
    sourceType: 'module',
    body: [
      {
        type: 'ExpressionStatement',
        expression,
        loc: expression.loc,
        range: expression.range,
      },
    ],
    loc: expression.loc,
    range: expression.range,
  };
};

const getJSXName = (expression: JSXIdentifier | JSXMemberExpression | JSXNamespacedName): string => {
  if (expression.type === 'JSXMemberExpression') {
    return `${getJSXName(expression.object)}.${expression.property.name}`;
  }
  if (expression.type === 'JSXNamespacedName') {
    return `${getJSXName(expression.namespace)}:${getJSXName(expression.name)}`;
  }
  return expression.name;
};

const transformJSXAttributeValue = (
  value: JSXElement | JSXFragment | JSXExpressionContainer | Literal | null,
): string | MdxJsxAttributeValueExpression | null | undefined => {
  if (value === null) {
    return null;
  }

  if (value.type === 'Literal') {
    return {
      type: 'mdxJsxAttributeValueExpression',
      value: '',
      data: {
        estree: expressionToProgram(value),
      },
    };
  }

  if (value.type === 'JSXExpressionContainer' && value.expression.type !== 'JSXEmptyExpression') {
    return {
      type: 'mdxJsxAttributeValueExpression',
      value: '',
      data: {
        estree: expressionToProgram(value.expression),
      },
    };
  }

  return undefined;
};

const transformJSXAttribute = (attribute: JSXAttribute | JSXSpreadAttribute): MdxJsxAttribute | MdxJsxExpressionAttribute => {
  if (attribute.type === 'JSXAttribute') {
    return {
      type: 'mdxJsxAttribute',
      name: attribute.name.type === 'JSXNamespacedName' ? `${attribute.name.namespace.name}:${attribute.name.name.name}` : attribute.name.name,
      value: transformJSXAttributeValue(attribute.value),
    } satisfies MdxJsxAttribute;
  }

  return {
    type: 'mdxJsxExpressionAttribute',
    value: '',
    data: {
      estree: expressionToProgram({
        type: 'ObjectExpression',
        properties: [
          {
            type: 'SpreadElement',
            argument: attribute.argument,
            loc: attribute.argument.loc,
            range: attribute.argument.range,
          },
        ],
        loc: attribute.loc,
        range: attribute.range,
      }),
    },
  } satisfies MdxJsxExpressionAttribute;
};

const transformJSXNode = (
  node: JSXElement | JSXFragment | JSXText | JSXExpressionContainer | JSXSpreadChild,
): ElementContent | MdxJsxFlowElementHast | MdxJsxFlowElementHast | MdxFlowExpressionHast => {
  const properties = node.loc
    ? {
      position: {
        start: node.loc.start,
        end: node.loc.end,
      },
    }
    : undefined;

  if (node.type === 'JSXText') {
    return {
      type: 'text',
      value: node.value,
      ...properties,
    } satisfies ElementContent;
  }

  if (node.type === 'JSXFragment') {
    return {
      type: 'mdxJsxFlowElement',
      name: null,
      attributes: [],
      children: node.children.map((e) => transformJSXNode(e)),
      ...properties,
    } satisfies MdxJsxFlowElementHast;
  }

  if (node.type === 'JSXElement') {
    const attributes = node.openingElement.attributes;
    return {
      type: 'mdxJsxFlowElement',
      name: getJSXName(node.openingElement.name),
      attributes: attributes.map((e) => transformJSXAttribute(e)),
      children: node.children.map((e) => transformJSXNode(e)),
      ...properties,
    } satisfies MdxJsxFlowElementHast;
  }

  if (node.type === 'JSXExpressionContainer') {
    if (node.expression.type === 'JSXEmptyExpression') {
      return {
        type: 'text',
        value: '',
      };
    }

    return {
      type: 'mdxFlowExpression',
      value: '',
      data: {
        estree: expressionToProgram(node.expression),
      },
      ...properties,
    } satisfies MdxFlowExpressionHast;
  }

  throw new TypeError(`Cannot parse ${node.type}`);
};

const transform: BuildVisitor<Root> = (node, index, parent) => {
  if (!parent || typeof index !== 'number') {
    return;
  }

  if (node.type === 'mdxFlowExpression') {
    const statement = node.data?.estree?.body?.[0];
    if (statement?.type === 'ExpressionStatement') {
      const { expression } = statement;
      if (expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
        parent.children[index] = transformJSXNode(expression);
      }
    }
  }
};

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
    .use(() => {
      return (tree) => {
        (visit as (tree: Node, transform: BuildVisitor<Root>) => void)(tree, transform);
      };
    })
    .use(rehypePlugins);
}
