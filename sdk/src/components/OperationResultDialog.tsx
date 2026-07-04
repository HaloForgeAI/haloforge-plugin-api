import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from "lucide-react";

export type OperationResultTone = "success" | "error";

export interface OperationResultDialogState {
  tone: OperationResultTone;
  title: string;
  summary: string;
  details?: string;
}

export interface OperationResultDialogProps {
  result: OperationResultDialogState | null;
  onClose: () => void;
  detailsLabel?: string;
  closeLabel?: string;
}

/**
 * Standard HaloForge plugin operation result dialog.
 *
 * Plugins render this themselves so the UX stays consistent without requiring
 * a privileged host popup bridge.
 */
export function OperationResultDialog({
  result,
  onClose,
  detailsLabel = "Details",
  closeLabel = "Close",
}: OperationResultDialogProps) {
  if (!result) return null;

  const hasDetails = Boolean(result.details?.trim());
  const toneClass = result.tone === "error"
    ? "border-red-400/35 bg-red-500/10 text-red-200"
    : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  const icon = result.tone === "error"
    ? <XCircle size={18} className="text-red-300" />
    : <CheckCircle2 size={18} className="text-emerald-300" />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <header className="flex items-start gap-3 border-b border-border/50 px-4 py-3">
          <div className={`rounded-lg border p-2 ${toneClass}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold text-foreground">{result.title}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground-secondary">
              {result.summary}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-foreground-secondary/50 transition-colors hover:bg-background hover:text-foreground"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <XCircle size={16} />
          </button>
        </header>

        {hasDetails && (
          <details className="border-b border-border/40 bg-background/40" open={result.tone === "error"}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs font-medium text-foreground-secondary transition-colors hover:text-foreground">
              <ChevronDown size={14} />
              {detailsLabel}
            </summary>
            <pre className="mx-4 mb-4 max-h-[44vh] overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground-secondary whitespace-pre-wrap">
              {result.details}
            </pre>
          </details>
        )}

        {!hasDetails && result.tone === "error" && (
          <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3 text-xs text-foreground-secondary/70">
            <AlertTriangle size={14} className="text-yellow-300" />
            {result.summary}
          </div>
        )}

        <footer className="flex justify-end px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-medium text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
          >
            {closeLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
