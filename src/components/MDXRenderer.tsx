import type { JastElement } from '@/lib/mdx';
import { render } from '@/lib/render-mdx';

export default function MDXRenderer({ jast }: { jast: JastElement }) {
  return render(jast);
}
