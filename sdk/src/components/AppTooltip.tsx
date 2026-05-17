import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type AppTooltipPlacement = "top" | "bottom" | "left" | "right";

export interface AppTooltipProps {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  tooltipClassName?: string;
  disabled?: boolean;
  offset?: number;
  placement?: AppTooltipPlacement;
}

interface TooltipPosition {
  left: number;
  top: number;
  ready: boolean;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function AppTooltip({
  children,
  className,
  content,
  disabled = false,
  offset = 8,
  placement = "top",
  tooltipClassName,
}: AppTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ left: 0, top: 0, ready: false });
  const active = open && !disabled && Boolean(content);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const margin = 8;
      let left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
      let top = triggerRect.top - tooltipRect.height - offset;

      if (placement === "bottom") {
        top = triggerRect.bottom + offset;
      } else if (placement === "left") {
        left = triggerRect.left - tooltipRect.width - offset;
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
      } else if (placement === "right") {
        left = triggerRect.right + offset;
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
      }

      setPosition({
        left: Math.round(clamp(left, margin, window.innerWidth - tooltipRect.width - margin)),
        top: Math.round(clamp(top, margin, window.innerHeight - tooltipRect.height - margin)),
        ready: true,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [active, content, offset, placement]);

  const tooltipStyle: CSSProperties = {
    position: "fixed",
    left: position.left,
    top: position.top,
    zIndex: 2147483000,
    maxWidth: 260,
    border: "1px solid var(--hf-tooltip-border, rgba(255, 255, 255, 0.12))",
    borderRadius: 8,
    background: "var(--hf-tooltip-background, rgba(17, 24, 39, 0.96))",
    boxShadow: "0 18px 48px -28px rgba(0, 0, 0, 0.72)",
    color: "var(--hf-tooltip-foreground, #f8fafc)",
    fontSize: 11,
    fontWeight: 650,
    lineHeight: 1.35,
    opacity: position.ready ? 1 : 0,
    overflowWrap: "break-word",
    padding: "6px 8px",
    pointerEvents: "none",
    whiteSpace: "normal",
  };

  return (
    <span
      ref={triggerRef}
      className={cx("hf-app-tooltip-trigger", className)}
      onBlurCapture={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      style={{ display: "inline-flex" }}
    >
      {children}
      {active && createPortal(
        <div ref={tooltipRef} role="tooltip" className={cx("hf-app-tooltip", tooltipClassName)} style={tooltipStyle}>
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
}
