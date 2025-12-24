import type { ReactNode } from "react";
import { createRenderer } from "./mdx/render";

function Callout({
	children,
	variant = "info",
	title,
}: {
	children?: ReactNode;
	title?: string;
	variant?: string;
}) {
	return (
		<details open>
			<summary>
				{variant.toUpperCase()}
				{title && ` (${title})`}
			</summary>
			{children && <div>{children}</div>}
		</details>
	);
}

function Author({ children }: { children?: ReactNode }) {
	return <div>{children}</div>;
}

export const components: Record<
	string,
	(props: Record<string, unknown>) => ReactNode
> = {
	Callout,
	Author,
};

export const render = createRenderer({
	components,
});
