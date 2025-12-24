import remarkHeadings, { type Heading } from '@vcarl/remark-headings';
import type { Expression as AcornExpression, Program as AcornProgram } from 'acorn';
import type {
  ArrayExpression,
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
  Node,
  ObjectExpression,
  Program,
  Property,
  SpreadElement,
} from 'estree-jsx';
import { type SyncHandler, walk } from 'estree-walker';
import type {
  Comment as HastComment,
  Doctype as HastDoctype,
  Element as HastElement,
  Properties as HastElementPropeties,
  Nodes as HastNodes,
  Root as HastRoot,
  Text as HastText,
} from 'hast';
import type { MdxJsxAttribute, MdxJsxExpressionAttribute, MdxJsxFlowElementHast, MdxJsxTextElementHast } from 'mdast-util-mdx-jsx';
import rehypeSlug from 'rehype-slug';
import styleToJS from 'style-to-js';
import { VFile } from 'vfile';
import { createEvaluator, createImportDeclarationProgram } from './evaluate';
import type { JastElement, JastNode, JastProps } from './jast';
import { matter } from './matter';
import { type CreateProcessorOptions, createProcessor } from './processor';
import { htmlAttributeToReactProp } from './shared';
import createGitHubSlugger from './slugger';

type HastRaw = HastNodes & { type: 'raw' };

type JSXValue = {
  $$jsx: [string | null, Record<string, unknown>, unknown[]];
};

function createJastElement(type: string | null, props: JastProps = {}, children?: JastNode[]): JastElement {
  return typeof children !== 'undefined' && children.length > 0 ? [type, props, children] : [type, props];
}

export function jsxNameToLiteral(name: JSXIdentifier | JSXNamespacedName | JSXMemberExpression): Literal {
  // <div />
  if (name.type === 'JSXIdentifier') {
    return {
      type: 'Literal',
      value: name.name,
    };
  }

  // <svg:path />
  if (name.type === 'JSXNamespacedName') {
    return {
      type: 'Literal',
      value: `${name.namespace.name}:${name.name.name}`,
    };
  }

  // <Foo.Bar.Baz />
  if (name.type === 'JSXMemberExpression') {
    const parts: string[] = [];
    let curr: JSXMemberExpression | JSXIdentifier = name;

    while (curr.type === 'JSXMemberExpression') {
      parts.unshift(curr.property.name);
      curr = curr.object;
    }

    // curr is JSXIdentifier here
    parts.unshift(curr.name);

    return {
      type: 'Literal',
      value: parts.join('.'),
    };
  }

  throw new Error('Unsupported JSXElement name');
}

function jsxAttributesToObject(attributes: (JSXAttribute | JSXSpreadAttribute)[]): ObjectExpression {
  const properties: (Property | SpreadElement)[] = [];

  for (const attribute of attributes) {
    // {...props}
    if (attribute.type === 'JSXSpreadAttribute') {
      properties.push({
        type: 'SpreadElement',
        argument: attribute.argument,
      });
    } else {
      let key: Property['key'];
      let value: Property['value'];

      // attr
      if (attribute.name.type === 'JSXIdentifier') {
        key = {
          type: 'Identifier',
          name: attribute.name.name,
        };
      }
      // svg:path
      else if (attribute.name.type === 'JSXNamespacedName') {
        key = {
          type: 'Literal',
          value: `${attribute.name.namespace.name}:${attribute.name.name.name}`,
        };
      } else {
        throw new Error('Unsupported JSXAttribute name');
      }

      // <Element attr />
      if (!attribute.value) {
        value = { type: 'Literal', value: true };
      }
      // attr="text"
      else if (attribute.value.type === 'Literal') {
        value = attribute.value;
      } else if (attribute.value.type === 'JSXExpressionContainer') {
        // attr={/* comment */}
        if (attribute.value.expression.type === 'JSXEmptyExpression') {
          value = {
            type: 'Identifier',
            name: 'undefined',
          };
        }
        // attr={expr}
        else {
          value = attribute.value.expression;
        }
      } else if (attribute.value.type === 'JSXElement') {
        value = jsxElementToObject(attribute.value);
      } else if (attribute.value.type === 'JSXFragment') {
        value = jsxFragmentToObject(attribute.value);
      } else {
        throw new Error('Unsupported JSXAttribute value');
      }

      properties.push({
        type: 'Property',
        key,
        value,
        kind: 'init',
        computed: false,
        method: false,
        shorthand: false,
      });
    }
  }

  return {
    type: 'ObjectExpression',
    properties,
  };
}

function jsxChildrenToArray(children: (JSXElement | JSXText | JSXExpressionContainer | JSXSpreadChild | JSXFragment)[]): ArrayExpression {
  const elements: (Expression | SpreadElement | null)[] = [];

  for (const child of children) {
    // Text
    if (child.type === 'JSXText') {
      elements.push({
        type: 'Literal',
        value: child.value.replace(/\s+/g, ' '),
      });
    }
    // {expr}
    else if (child.type === 'JSXExpressionContainer') {
      if (child.expression.type !== 'JSXEmptyExpression') {
        elements.push(child.expression);
      }
    }
    // {...expr}
    else if (child.type === 'JSXSpreadChild') {
      elements.push({
        type: 'SpreadElement',
        argument: child.expression,
      });
    }
    // <Element />
    else if (child.type === 'JSXElement') {
      elements.push(jsxElementToObject(child));
    }
    // <>...</>
    else if (child.type === 'JSXFragment') {
      elements.push(jsxFragmentToObject(child));
    } else {
      throw new Error('Unsupported JSXElement child');
    }
  }

  return {
    type: 'ArrayExpression',
    elements,
  };
}

function jsxElementToObject(node: JSXElement): ObjectExpression {
  return {
    type: 'ObjectExpression',
    properties: [
      {
        type: 'Property',
        key: { type: 'Identifier', name: '$$jsx' },
        value: {
          type: 'ArrayExpression',
          elements: [
            jsxNameToLiteral(node.openingElement.name),
            jsxAttributesToObject(node.openingElement.attributes),
            jsxChildrenToArray(node.children),
          ],
        },
        kind: 'init',
        computed: false,
        method: false,
        shorthand: false,
      },
    ],
  };
}

function jsxFragmentToObject(node: JSXFragment): ObjectExpression {
  return {
    type: 'ObjectExpression',
    properties: [
      {
        type: 'Property',
        key: { type: 'Identifier', name: '$$jsx' },
        value: {
          type: 'ArrayExpression',
          elements: [
            { type: 'Literal', value: null },
            {
              type: 'ObjectExpression',
              properties: [],
            },
            jsxChildrenToArray(node.children),
          ],
        },
        kind: 'init',
        computed: false,
        method: false,
        shorthand: false,
      },
    ],
  };
}

type TransformJSXReturn<N> = N extends JSXElement | JSXFragment ? ObjectExpression : N;

function transformJSX<N extends Node>(ast: N): TransformJSXReturn<N> {
  const handlers: {
    enter: SyncHandler;
  } = {
    enter(node) {
      if (node.type === 'JSXElement') {
        this.replace(jsxElementToObject(node));
      }
      if (node.type === 'JSXFragment') {
        this.replace(jsxFragmentToObject(node));
      }
    },
  };

  if (ast.type === 'JSXElement' || ast.type === 'JSXFragment') {
    const wrapper = {
      type: 'ArrayExpression',
      elements: [ast],
    } as const satisfies ArrayExpression;
    walk(wrapper, handlers);
    return wrapper.elements[0] as TransformJSXReturn<N>;
  }

  walk(ast, handlers);
  return ast as TransformJSXReturn<N>;
}

/// ! ===== NEW
export interface CreateParserOptions extends CreateProcessorOptions {}

export interface ParseResult {
  file: VFile;
  tree: JastElement;
  frontmatter: unknown;
  headings: Heading[];
}

export type ParseFunction = (input: string) => Promise<ParseResult>;

export type CreateParserResult = ParseFunction;

export function createParser({ remarkPlugins = [], rehypePlugins = [], remarkRehypeOptions }: CreateParserOptions = {}): CreateParserResult {
  const processor = createProcessor({
    remarkPlugins: [remarkHeadings, ...remarkPlugins],
    rehypePlugins: [rehypeSlug, ...rehypePlugins],
    remarkRehypeOptions,
  });

  return async (input: string) => {
    const { data: frontmatter, stripped } = matter(input);

    const evaluator = createEvaluator({
      dependencies: {
        '__mdx:define:mdx__': {
          frontmatter,
        },
      },
    });

    evaluator.evaluateProgram(
      createImportDeclarationProgram({
        namedImports: ['frontmatter'],
        module: '__mdx:define:mdx__',
      }),
    );

    const file = new VFile(stripped || input);
    const hast = await processor.run(processor.parse(file), file);

    const slugger = createGitHubSlugger();
    const { headings = [] } = file.data as {
      headings?: Heading[];
    };
    for (const heading of headings) {
      heading.data = {
        ...heading.data,
        id: slugger(heading.value),
      };
    }

    const state = {
      unsupported(_node: HastNodes) {
        return undefined;
      },
      root(root: HastRoot) {
        return createJastElement(null, {}, this.all(root.children));
      },
      element(element: HastElement) {
        return createJastElement(element.tagName, this.properties(element.properties), this.all(element.children));
      },
      text(text: HastText) {
        return text.value;
      },
      comment(comment: HastComment) {
        return this.unsupported(comment);
      },
      doctype(doctype: HastDoctype) {
        return this.unsupported(doctype);
      },
      raw(raw: HastRaw) {
        return this.unsupported(raw);
      },
      mdxFlowExpression(expression: Expression) {
        return this.evaluated(evaluator.evaluateExpression(expression as AcornExpression));
      },
      mdxTextExpression(expression: Expression) {
        return this.evaluated(evaluator.evaluateExpression(expression as AcornExpression));
      },
      mdxJsxFlowElement(element: MdxJsxFlowElementHast) {
        return createJastElement(element.name, this.attributes(element.attributes), this.all(element.children));
      },
      mdxJsxTextElement(element: MdxJsxTextElementHast) {
        return createJastElement(element.name, this.attributes(element.attributes), this.all(element.children));
      },
      mdxjsEsm(program: Program) {
        evaluator.evaluateProgram(program as AcornProgram);
      },
      one(node: HastNodes) {
        if (node.type === 'root') {
          return this.root(node);
        }
        if (node.type === 'element') {
          return this.element(node);
        }
        if (node.type === 'text') {
          return this.text(node);
        }
        if (node.type === 'comment') {
          return this.comment(node);
        }
        if (node.type === 'doctype') {
          return this.doctype(node);
        }
        if (node.type === 'raw') {
          return this.raw(node);
        }
        if (node.type === 'mdxFlowExpression') {
          const statement = node.data?.estree?.body?.[0];
          if (statement?.type === 'ExpressionStatement') {
            return this.mdxFlowExpression(transformJSX(statement.expression));
          }
        }
        if (node.type === 'mdxTextExpression') {
          const statement = node.data?.estree?.body?.[0];
          if (statement?.type === 'ExpressionStatement') {
            return this.mdxTextExpression(transformJSX(statement.expression));
          }
        }
        if (node.type === 'mdxJsxFlowElement') {
          return this.mdxJsxFlowElement(node);
        }
        if (node.type === 'mdxJsxTextElement') {
          return this.mdxJsxTextElement(node);
        }
        if (node.type === 'mdxjsEsm') {
          const program = node.data?.estree;
          if (program) {
            return this.mdxjsEsm(transformJSX(program));
          }
        }
        return this.unsupported(node);
      },
      all(nodes: HastNodes[]) {
        const result: JastNode[] = [];

        for (const node of nodes) {
          const item = this.one(node);
          if (typeof item !== 'undefined') {
            result.push(item);
          }
        }

        return result;
      },
      properties(properties: HastElementPropeties) {
        const props: JastProps = {};

        for (const name in properties) {
          const value = properties[name];
          if (name === 'style' && typeof value === 'string') {
            props.style = styleToJS(value, { reactCompat: true });
          } else if (name !== 'children') {
            props[htmlAttributeToReactProp(name)] = value;
          }
        }

        return props;
      },
      attributes(attributes: (MdxJsxAttribute | MdxJsxExpressionAttribute)[]) {
        const props: JastProps = {};

        for (const attribute of attributes) {
          if (attribute.type === 'mdxJsxAttribute') {
            // attr="value"
            if (typeof attribute.value === 'string') {
              props[attribute.name] = attribute.value;
            }
            // <Element attr />
            else if (attribute.value === null) {
              props[attribute.name] = true;
            }
            // attr={expr}
            else if (typeof attribute.value === 'object' && attribute.value?.type === 'mdxJsxAttributeValueExpression') {
              const statement = attribute.value.data?.estree?.body?.[0];
              if (statement?.type === 'ExpressionStatement') {
                const evaluated = evaluator.evaluateExpression(transformJSX(statement.expression) as AcornExpression);
                props[attribute.name] = evaluated;
              }
            }
          }
          // attr={...expr}
          else if (attribute.type === 'mdxJsxExpressionAttribute') {
            const statement = attribute.data?.estree?.body?.[0];
            if (statement?.type === 'ExpressionStatement' && statement.expression.type === 'ObjectExpression') {
              const evaluated = evaluator.evaluateExpression(transformJSX(statement.expression) as AcornExpression);
              if (typeof evaluated === 'object' && evaluated !== null) {
                Object.assign(props, evaluated);
              }
            }
          }
        }

        return props;
      },
      isJSX(value: unknown): value is JSXValue {
        if (typeof value === 'object' && value !== null && '$$jsx' in value && Array.isArray(value.$$jsx)) {
          return true;
        }
        return false;
      },
      jsx(value: JSXValue) {
        const [type, props, children] = value.$$jsx;
        return createJastElement(type, props, children);
      },
      array(value: unknown[]): JastNode {
        const items: JastNode[] = [];
        for (const element of value) {
          const item = this.item(element);
          if (typeof item !== 'undefined') {
            items.push(item);
          }
        }
        if (items.length === 1) {
          return items[0];
        }
        return createJastElement(null, {}, items);
      },
      item(value: unknown): JastNode | undefined {
        if (typeof value === 'string' || typeof value === 'number') {
          return value;
        }
        if (this.isJSX(value)) {
          return this.jsx(value);
        }
      },
      evaluated(value: unknown) {
        if (Array.isArray(value)) {
          return this.array(value);
        }
        return this.item(value);
      },
    };

    const tree = state.root(hast);

    return {
      file,
      frontmatter,
      headings,
      tree,
    };
  };
}
