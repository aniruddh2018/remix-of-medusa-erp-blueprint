import type { AnalysisResult, StatSummary } from "@/types/queryEngine";

/**
 * Analysis Library for ERP Query Engine
 * Provides trend detection, anomaly detection, and narrative generation
 */

// ============================================================================
// Trend Detection
// ============================================================================

/**
 * Detect trends in time-series data
 * @param data - Array of data points
 * @param timeField - Field name containing timestamp/date
 * @param valueField - Field name containing numeric value
 * @returns Trend analysis result
 */
export function detectTrends(
  data: any[],
  timeField: string,
  valueField: string
): {
  trend: "up" | "down" | "stable" | "insufficient_data";
  trendStrength: number; // 0-1, higher means stronger trend
  direction: string;
  insights: string[];
} {
  if (data.length < 2) {
    return {
      trend: "insufficient_data",
      trendStrength: 0,
      direction: "Not enough data to determine trend",
      insights: ["Need at least 2 data points for trend analysis"],
    };
  }

  // Sort data by time
  const sortedData = [...data].sort((a, b) => {
    const aTime = new Date(a[timeField]).getTime();
    const bTime = new Date(b[timeField]).getTime();
    return aTime - bTime;
  });

  // Extract values
  const values = sortedData
    .map((item) => item[valueField])
    .filter((v) => v !== null && v !== undefined && typeof v === "number");

  if (values.length < 2) {
    return {
      trend: "insufficient_data",
      trendStrength: 0,
      direction: "Not enough numeric data to determine trend",
      insights: ["Need at least 2 valid numeric data points"],
    };
  }

  // Calculate trend using linear regression
  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const y = values;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return {
      trend: "stable",
      trendStrength: 0,
      direction: "Insufficient variation in data to determine trend",
      insights: ["Data points are identical, cannot determine trend"],
    };
  }
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const correlation = calculateCorrelation(x, y);

  // Determine trend
  const trendStrength = Math.abs(correlation);
  let trend: "up" | "down" | "stable";
  let direction: string;

  if (Math.abs(slope) < 0.01) {
    trend = "stable";
    direction = "Values remain relatively constant";
  } else if (slope > 0) {
    trend = "up";
    direction = "Values are increasing over time";
  } else {
    trend = "down";
    direction = "Values are decreasing over time";
  }

  // Generate insights
  const insights: string[] = [];
  insights.push(direction);

  if (trendStrength > 0.7) {
    insights.push("Strong trend detected");
  } else if (trendStrength > 0.4) {
    insights.push("Moderate trend detected");
  } else {
    insights.push("Weak or no clear trend");
  }

  // Calculate percent change
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  if (firstValue === 0) {
    insights.push(lastValue > 0 ? "Values increased from zero" : "Values remain at zero");
  } else {
    const percentChange = ((lastValue - firstValue) / Math.abs(firstValue)) * 100;
    insights.push(`Overall change: ${percentChange.toFixed(1)}%`);
  }

  return {
    trend,
    trendStrength,
    direction,
    insights,
  };
}

/**
 * Calculate correlation coefficient
 */
function calculateCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}

// ============================================================================
// Anomaly Detection
// ============================================================================

/**
 * Detect anomalies in numeric data using z-score method
 * @param data - Array of data points
 * @param valueField - Field name containing numeric value
 * @param threshold - Z-score threshold (default: 2)
 * @returns Anomaly analysis result
 */
export function detectAnomalies(
  data: any[],
  valueField: string,
  threshold: number = 2
): {
  anomalies: Array<{
    index: number;
    value: number;
    zScore: number;
    severity: "low" | "medium" | "high";
  }>;
  anomalyCount: number;
  anomalyPercentage: number;
  insights: string[];
} {
  // Extract numeric values
  const values = data
    .map((item, index) => ({ value: item[valueField] as number, index }))
    .filter((item) => item.value !== null && item.value !== undefined && typeof item.value === "number");

  if (values.length < 3) {
    return {
      anomalies: [],
      anomalyCount: 0,
      anomalyPercentage: 0,
      insights: ["Need at least 3 data points for anomaly detection"],
    };
  }

  // Calculate statistics
  const numericValues = values.map((v) => v.value);
  const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
  const variance = numericValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numericValues.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return {
      anomalies: [],
      anomalyCount: 0,
      anomalyPercentage: 0,
      insights: ["All values are identical — no anomalies possible"],
    };
  }

  // Detect anomalies
  const anomalies = values
    .map((item) => {
      const zScore = Math.abs((item.value - mean) / stdDev);
      const severity: "low" | "medium" | "high" = 
        zScore >= 3 ? "high" : zScore >= 2.5 ? "medium" : "low";
      return {
        index: item.index,
        value: item.value,
        zScore,
        severity,
      };
    })
    .filter((item) => item.zScore >= threshold);

  const anomalyCount = anomalies.length;
  const anomalyPercentage = (anomalyCount / values.length) * 100;

  // Generate insights
  const insights: string[] = [];
  
  if (anomalyCount === 0) {
    insights.push("No significant anomalies detected");
  } else {
    insights.push(`Found ${anomalyCount} anomalies (${anomalyPercentage.toFixed(1)}% of data)`);
    
    const highSeverity = anomalies.filter((a) => a.severity === "high").length;
    const mediumSeverity = anomalies.filter((a) => a.severity === "medium").length;
    
    if (highSeverity > 0) {
      insights.push(`${highSeverity} high-severity anomalies detected`);
    }
    if (mediumSeverity > 0) {
      insights.push(`${mediumSeverity} medium-severity anomalies detected`);
    }
    
    insights.push(`Mean: ${mean.toFixed(2)}, Standard Deviation: ${stdDev.toFixed(2)}`);
  }

  return {
    anomalies,
    anomalyCount,
    anomalyPercentage,
    insights,
  };
}

// ============================================================================
// Narrative Generation
// ============================================================================

/**
 * Generate AI narrative for query results
 * @param query - Original natural language query
 * @param results - Query results data
 * @param analysis - Analysis results
 * @returns Generated narrative
 */
export async function generateNarrative(
  query: string,
  results: any[],
  analysis: AnalysisResult
): Promise<string> {
  // Create a summary of the data
  const summary = createDataSummary(results, analysis);

  // Generate basic narrative (current implementation - LLM enhancement TODO in Phase 2)
  return generateBasicNarrative(query, summary, analysis);
}

/**
 * Create a summary of the data for narrative generation
 */
function createDataSummary(results: any[], analysis: AnalysisResult): {
  rowCount: number;
  columnCount: number;
  numericColumns: string[];
  dateColumns: string[];
  sampleData: any[];
} {
  if (!results || results.length === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      numericColumns: [],
      dateColumns: [],
      sampleData: [],
    };
  }

  const columns = Object.keys(results[0]);
  const numericColumns: string[] = [];
  const dateColumns: string[] = [];

  // Detect column types
  columns.forEach((col) => {
    const sampleValue = results.find((row) => row[col] !== null && row[col] !== undefined)?.[col];
    
    if (typeof sampleValue === "number") {
      numericColumns.push(col);
    } else if (sampleValue instanceof Date || (typeof sampleValue === "string" && !isNaN(Date.parse(sampleValue)))) {
      dateColumns.push(col);
    }
  });

  return {
    rowCount: results.length,
    columnCount: columns.length,
    numericColumns,
    dateColumns,
    sampleData: results.slice(0, 3), // First 3 rows as sample
  };
}

/**
 * Generate basic narrative without LLM
 */
function generateBasicNarrative(
  query: string,
  summary: ReturnType<typeof createDataSummary>,
  analysis: AnalysisResult
): string {
  const narratives: string[] = [];

  // Start with the query context
  narratives.push(`In response to "${query}":`);

  // Data overview
  if (summary.rowCount === 0) {
    narratives.push("No data was found matching your query.");
  } else {
    narratives.push(
      `Found ${summary.rowCount} records across ${summary.columnCount} columns.`
    );

    // Numeric insights
    if (analysis.summary_stats && Object.keys(analysis.summary_stats).length > 0) {
      narratives.push("Key statistics:");
      Object.entries(analysis.summary_stats).forEach(([col, stats]) => {
        narratives.push(
          `- ${col}: Average ${stats.avg.toFixed(2)}, Range ${stats.min} to ${stats.max}, Total ${stats.sum.toFixed(2)}`
        );
      });
    }

    // Column insights
    if (summary.numericColumns.length > 0) {
      narratives.push(`Numeric columns: ${summary.numericColumns.join(", ")}`);
    }
    if (summary.dateColumns.length > 0) {
      narratives.push(`Date columns: ${summary.dateColumns.join(", ")}`);
    }
  }

  return narratives.join("\n\n");
}


// ============================================================================
// Advanced Analysis Functions
// ============================================================================

/**
 * Calculate moving average
 * @param data - Array of numeric values
 * @param windowSize - Window size for moving average
 * @returns Array of moving averages
 */
export function calculateMovingAverage(data: number[], windowSize: number): number[] {
  if (windowSize >= data.length) {
    return data;
  }

  const result: number[] = [];
  for (let i = 0; i <= data.length - windowSize; i++) {
    const window = data.slice(i, i + windowSize);
    const avg = window.reduce((sum, val) => sum + val, 0) / windowSize;
    result.push(avg);
  }
  return result;
}

/**
 * Calculate compound annual growth rate (CAGR)
 * @param startValue - Starting value
 * @param endValue - Ending value
 * @param periods - Number of periods (years)
 * @returns CAGR as percentage
 */
export function calculateCAGR(startValue: number, endValue: number, periods: number): number {
  if (startValue <= 0 || periods <= 0) {
    return 0;
  }
  return (Math.pow(endValue / startValue, 1 / periods) - 1) * 100;
}

/**
 * Calculate seasonality index for time series data
 * @param data - Array of data points with date and value
 * @param dateField - Field name containing date
 * @param valueField - Field name containing value
 * @returns Seasonality analysis
 */
export function calculateSeasonality(
  data: any[],
  dateField: string,
  valueField: string
): {
  hasSeasonality: boolean;
  seasonalPattern: Record<string, number>;
  insights: string[];
} {
  // Group by month
  const monthlyData: Record<string, number[]> = {};
  
  data.forEach((item) => {
    const date = new Date(item[dateField]);
    const month = date.toLocaleString("default", { month: "long" });
    const value = item[valueField];
    
    if (typeof value === "number") {
      if (!monthlyData[month]) {
        monthlyData[month] = [];
      }
      monthlyData[month].push(value);
    }
  });

  // Calculate monthly averages
  const monthlyAverages: Record<string, number> = {};
  Object.entries(monthlyData).forEach(([month, values]) => {
    monthlyAverages[month] = values.reduce((sum, val) => sum + val, 0) / values.length;
  });

  // Calculate overall average
  const allValues = Object.values(monthlyData).flat();
  const overallAverage = allValues.reduce((sum, val) => sum + val, 0) / allValues.length;

  // Calculate seasonal indices
  const seasonalPattern: Record<string, number> = {};
  Object.entries(monthlyAverages).forEach(([month, avg]) => {
    seasonalPattern[month] = (avg / overallAverage) * 100;
  });

  // Determine if there's significant seasonality
  const variation = Object.values(seasonalPattern);
  const maxVariation = Math.max(...variation);
  const minVariation = Math.min(...variation);
  const hasSeasonality = maxVariation - minVariation > 20; // 20% variation threshold

  const insights: string[] = [];
  if (hasSeasonality) {
    insights.push("Significant seasonal pattern detected");
    const peakMonth = Object.entries(seasonalPattern).reduce((a, b) => (a[1] > b[1] ? a : b));
    const lowMonth = Object.entries(seasonalPattern).reduce((a, b) => (a[1] < b[1] ? a : b));
    insights.push(`Peak season: ${peakMonth[0]} (${peakMonth[1].toFixed(1)}% of average)`);
    insights.push(`Low season: ${lowMonth[0]} (${lowMonth[1].toFixed(1)}% of average)`);
  } else {
    insights.push("No significant seasonal pattern detected");
  }

  return {
    hasSeasonality,
    seasonalPattern,
    insights,
  };
}
