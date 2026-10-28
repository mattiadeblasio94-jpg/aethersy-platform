import { Coins } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

export interface CreditDisplayProps {
  amount: number;
  /** Mostra il CTA di upgrade sotto il contatore. */
  showUpgrade?: boolean;
  onUpgradeClick?: () => void;
  className?: string;
}

/**
 * Contatore crediti (brief §2.3). Compatto, con icona e CTA di upgrade
 * opzionale usata nella sidebar.
 */
export function CreditDisplay({
  amount,
  showUpgrade = false,
  onUpgradeClick,
  className,
}: CreditDisplayProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-tertiary/25 bg-tertiary/10 px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-tertiary" aria-hidden="true" />
        <span className="text-sm font-semibold text-text-primary">
          {formatNumber(amount)} crediti
        </span>
      </div>
      {showUpgrade && (
        <button
          type="button"
          onClick={onUpgradeClick}
          className="mt-1.5 text-xs font-medium text-tertiary underline-offset-2 hover:underline"
        >
          Aumenta i crediti
        </button>
      )}
    </div>
  );
}
