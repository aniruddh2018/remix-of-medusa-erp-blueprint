import type { QualityMetrics } from '@/services/importValidators';

interface QualityScoreDashboardProps {
  metrics: QualityMetrics;
}

const getBarColor = (score: number) => {
  if (score >= 90) return 'bg-green-500';
  if (score >= 70) return 'bg-amber-500';
  return 'bg-red-500';
};

const getTextColor = (score: number) => {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-red-600';
};

export function QualityScoreDashboard({ metrics }: QualityScoreDashboardProps) {
  const cards = [
    { name: 'Completeness', score: metrics.completeness },
    { name: 'Accuracy', score: metrics.accuracy },
    { name: 'Consistency', score: metrics.consistency },
    { name: 'Uniqueness', score: metrics.uniqueness },
  ];

  const overallColor = metrics.overall >= 90 ? 'text-green-600' : metrics.overall >= 70 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="rounded-md border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Data Quality Score</h3>
        <span className={`text-2xl font-bold ${overallColor}`}>{metrics.overall}%</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cards.map(card => (
          <div key={card.name} className="bg-background rounded-md border p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{card.name}</span>
              <span className={`text-sm font-bold ${getTextColor(card.score)}`}>{card.score}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getBarColor(card.score)}`}
                style={{ width: `${card.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {metrics.overall < 70 && (
        <p className="text-xs text-red-600">
          Quality below recommended threshold. Review errors before importing.
        </p>
      )}
    </div>
  );
}
