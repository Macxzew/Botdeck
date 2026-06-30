import type { ComponentPropsWithoutRef, ElementType, MouseEvent, ReactNode } from "react";

function joinClassNames(...classNames: Array<string | undefined | false | null>) {
	return classNames.filter(Boolean).join(" ");
}

type ModalSurfaceElement = "section" | "div" | "aside";

type ModalProps<T extends ModalSurfaceElement = "section"> = {
	as?: T;
	children?: ReactNode;
	backdropClassName?: string;
	surfaceClassName?: string;
	onClose?: () => void;
	closeOnBackdrop?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className" | "role">;

export function Modal<T extends ModalSurfaceElement = "section">({
	as,
	children,
	backdropClassName,
	surfaceClassName,
	onClose,
	closeOnBackdrop = true,
	onMouseDown,
	...props
}: ModalProps<T>) {
	const Surface = (as ?? "section") as ElementType;
	const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
		if (closeOnBackdrop && event.target === event.currentTarget) {
			onClose?.();
		}
	};
	const handleSurfaceMouseDown = (event: MouseEvent) => {
		event.stopPropagation();
		onMouseDown?.(event as never);
	};

	return (
		<div className={joinClassNames("uiModalBackdrop", backdropClassName ?? "modalBackdrop")} role="presentation" onMouseDown={handleBackdropMouseDown}>
			<Surface
				className={joinClassNames("uiModal", surfaceClassName)}
				role="dialog"
				aria-modal="true"
				onMouseDown={handleSurfaceMouseDown}
				{...props}
			>
				{children}
			</Surface>
		</div>
	);
}
