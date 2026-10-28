import { Coins } from "lucide-react";
import { cn, formatNumber } from "@pv/lib/utils";

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
        "rounded-lg border border-pv-orange/25 bg-pv-orange/10 px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-pv-orange" aria-hidden="true" />
        <span className="text-sm font-semibold text-pv-ink">
          {formatNumber(amount)} crediti
        </span>
      </div>
      {showUpgrade && (
        <button
          type="button"
          onClick={onUpgradeClick}
          className="mt-1.5 text-xs font-medium text-pv-orange underline-offset-2 hover:underline"
        >
          Aumenta i crediti
        </button>
      )}
    </div>
  );
}
