import type { ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import type { JastElement, JastNode } from './jast';

export interface CreateRendererOptions {
  components?: Record<string, (props: Record<string, unknown>) => ReactNode>;
}

export type RenderFunction = (jast: JastElement) => ReactNode;

export type CreateRenderResult = RenderFunction;

export function createRenderer({ components = {} }: CreateRendererOptions = {}): CreateRenderResult {
  return (jast) => {
    const transform = (node: JastNode): ReactNode => {
      if (node === null || typeof node === 'boolean') {
        return null;
      }

      if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
        return node;
      }

      const [type, props, children] = node;

      const resolvedType = type === null ? Fragment : (components[type] ?? type);

      const resolvedChildren = children ? children.map(transform) : Array.isArray(props.children) ? props.children : undefined;

      return resolvedChildren && resolvedChildren.length > 1
        ? jsxs(resolvedType, { ...props, children: resolvedChildren })
        : jsx(resolvedType, {
            ...props,
            children: resolvedChildren?.[0],
          });
    };

    return transform(jast);
  };
}