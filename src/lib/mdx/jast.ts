export type JastPrimitive = string | number | bigint | boolean | null;

export type JastNode = JastPrimitive | JastElement;

export type JastProps = {
  key?: unknown;
  ref?: unknown;
  children?: JastPrimitive[];
  [prop: string]: unknown;
};

export type JastElement = [type: string | null, props: JastProps, children?: JastNode[]];
