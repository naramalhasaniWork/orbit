/**
 * Lightweight 5-field cron expression parser.
 * Fields: minute (0-59), hour (0-23), day-of-month (1-31), month (1-12), day-of-week (0-6, Sun=0).
 *
 * Supports: wildcards (*), ranges (1-5), steps (star/2, 1-5/2), lists (1,3,5).
 */

interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

function parseField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;
    const range = stepMatch ? stepMatch[1] : part;

    let start: number;
    let end: number;

    if (range === "*") {
      start = min;
      end = max;
    } else if (range.includes("-")) {
      const [lo, hi] = range.split("-").map(Number);
      start = lo;
      end = hi;
    } else {
      start = parseInt(range, 10);
      end = start;
    }

    if (isNaN(start) || isNaN(end) || isNaN(step)) continue;
    start = Math.max(start, min);
    end = Math.min(end, max);

    for (let i = start; i <= end; i += step) {
      values.add(i);
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

function parseCronExpression(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
  }

  return {
    minutes: parseField(parts[0], 0, 59),
    hours: parseField(parts[1], 0, 23),
    daysOfMonth: parseField(parts[2], 1, 31),
    months: parseField(parts[3], 1, 12),
    daysOfWeek: parseField(parts[4], 0, 6),
  };
}

function matchesCron(date: Date, fields: CronFields): boolean {
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const dayOfWeek = date.getUTCDay();

  return (
    fields.minutes.includes(minute) &&
    fields.hours.includes(hour) &&
    fields.months.includes(month) &&
    (fields.daysOfMonth.includes(dayOfMonth) || fields.daysOfWeek.includes(dayOfWeek))
  );
}

/**
 * Calculate the next occurrence of a cron expression after the given date (or now).
 * Searches up to 366 days ahead. Returns null if no match found.
 */
export function getNextCronDate(
  expression: string,
  after?: Date
): Date {
  const fields = parseCronExpression(expression);
  const start = after ? new Date(after.getTime()) : new Date();

  // Advance to the next whole minute
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  // Search minute-by-minute for up to 366 days
  const maxIterations = 366 * 24 * 60;
  const candidate = new Date(start.getTime());

  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(candidate, fields)) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  throw new Error(
    `Could not find next run time for cron expression "${expression}" within 366 days`
  );
}

/**
 * Validate a cron expression without computing the next date.
 */
export function isValidCronExpression(expression: string): boolean {
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) return false;
    parseCronExpression(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return a human-readable description of common cron patterns.
 */
export function describeCron(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return expression;

  const [min, hour, dom, mon, dow] = parts;

  if (min !== "*" && hour !== "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`;
  }

  if (min !== "*" && hour !== "*" && dom === "*" && mon === "*" && dow !== "*") {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayNum = parseInt(dow, 10);
    const dayName = dayNames[dayNum] ?? `day ${dow}`;
    return `Weekly on ${dayName} at ${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`;
  }

  if (min === "0" && hour.startsWith("*/")) {
    return `Every ${hour.slice(2)} hours`;
  }

  if (min === "0" && hour === "*") {
    return "Every hour";
  }

  return expression;
}
