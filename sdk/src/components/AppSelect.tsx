import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";

export interface AppSelectChangeEvent {
  target: {
    value: string;
  };
}

export interface AppSelectProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  onChange?: (event: AppSelectChangeEvent) => void;
  menuClassName?: string;
  optionClassName?: string;
  placement?: "bottom" | "top";
  title?: string;
  value?: string | null;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

interface ParsedOption {
  key: string;
  value: string;
  label: ReactNode;
  disabled: boolean;
}

type OptionElement = ReactElement<{
  value?: string;
  children?: ReactNode;
  disabled?: boolean;
}, "option">;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function parseOptions(children: ReactNode): ParsedOption[] {
  const options: ParsedOption[] = [];

  Children.forEach(children, (child, index) => {
    if (!isValidElement(child) || child.type !== "option") {
      return;
    }

    const option = child as OptionElement;
    options.push({
      key: option.key?.toString() ?? `option-${index}-${String(option.props.value ?? "")}`,
      value: String(option.props.value ?? ""),
      label: option.props.children,
      disabled: Boolean(option.props.disabled),
    });
  });

  return options;
}

export function AppSelect({
  children,
  className,
  disabled = false,
  onChange,
  optionClassName,
  menuClassName,
  placement = "bottom",
  title,
  value,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const options = useMemo(() => parseOptions(children), [children]);
  const normalizedValue = String(value ?? "");
  const selectedOption = options.find((option) => option.value === normalizedValue) ?? options[0] ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function commit(nextValue: string) {
    onChange?.({ target: { value: nextValue } });
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        title={title ?? (typeof selectedOption?.label === "string" ? selectedOption.label : undefined)}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        onKeyDown={(event) => {
          if (disabled) {
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cx(
          "flex w-full items-center gap-2 text-left transition-colors",
          "hover:border-primary/30 hover:bg-surface/70",
          "focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20",
          "disabled:cursor-not-allowed disabled:opacity-60",
          open && "border-primary/45 bg-surface/85 shadow-[0_16px_36px_-24px] shadow-black/70",
          className,
          "pr-10",
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {selectedOption?.label ?? <span className="text-foreground-secondary/60">&nbsp;</span>}
        </span>
        <ChevronDown
          size={14}
          className={cx(
            "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-foreground-secondary/60 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && !disabled && (
        <div
          className={cx(
            "hf-elevated-menu absolute left-0 z-50 w-full overflow-hidden rounded-xl border p-1 backdrop-blur-xl",
            placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            menuClassName,
          )}
        >
          <div role="listbox" className="max-h-64 overflow-y-auto">
            {options.map((option) => {
              const selected = option.value === normalizedValue;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  onClick={() => commit(option.value)}
                  data-selected={selected ? "true" : undefined}
                  className={cx(
                    "hf-menu-item flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    selected ? "text-foreground" : "text-foreground-secondary hover:text-foreground",
                    option.disabled && "cursor-not-allowed opacity-45",
                    optionClassName,
                  )}
                >
                  <span className={cx("min-w-0 flex-1 truncate", selected && "font-medium")}>{option.label}</span>
                  {selected && <Check size={14} className="shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
