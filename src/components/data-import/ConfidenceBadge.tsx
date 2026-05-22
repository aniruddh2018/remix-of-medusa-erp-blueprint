import { Check, AlertTriangle, XCircle, Sparkles } from 'lucide-react';

interface ConfidenceBadgeProps {
  confidence: number | undefined;
  isAiGenerated?: boolean;
  size?: 'sm' | 'md';
}

const STYLES: Record<string, { bg: string; text: string; border: string; icon: React.ElementType }> = {
  high: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: Check },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: AlertTriangle },
  low: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircle },
};

export function ConfidenceBadge({ confidence, isAiGenerated, size = 'md' }: ConfidenceBadgeProps) {
  const level = !confidence ? 'low' : confidence >= 99 ? 'high' : confidence >= 90 ? 'medium' : 'low';
  const style = STYLES[level];
  const Icon = style.icon;
  const label = !confidence ? 'Review' : level === 'high' ? 'Auto' : level === 'medium' ? 'Suggested' : 'Review';

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border
        ${style.bg} ${style.text} ${style.border}
        ${size === 'sm' ? 'text-[10px] px-1' : ''}
      `}
      title={confidence !== undefined ? `Confidence: ${confidence}%` : 'Needs review'}
    >
      <Icon className={`${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
      {confidence !== undefined && <span>{confidence}%</span>}
      {isAiGenerated && <Sparkles className={`${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} opacity-60`} />}
      <span className="sr-only">{label}</span>
    </span>
  );
}
