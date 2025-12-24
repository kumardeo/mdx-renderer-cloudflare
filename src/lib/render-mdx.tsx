import type { ReactNode } from 'react';
import  { createRenderer } from './mdx/render';

export const components: Record<string, (props: Record<string, unknown>) => ReactNode> = {
  Callout({ children }: { children?: ReactNode }) {
    return <div>{children}</div>
  }
};

export const render = createRenderer({
  components,
});
