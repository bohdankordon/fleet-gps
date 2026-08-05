export type EqugpsDateNormalization =
  | { status: "missing"; original: null | undefined; date: undefined }
  | { status: "recognized"; original: string; date: Date }
  | { status: "unrecognized"; original: string; date: undefined };

function parseLocalDateTime(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) return undefined;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisecondsText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const milliseconds = Number((millisecondsText ?? "").padEnd(3, "0") || "0");

  // A timezone is absent, so construct local time rather than silently assigning UTC.
  const date = new Date(year, month - 1, day, hour, minute, second, milliseconds);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return undefined;
  }

  return date;
}

export function normalizeEqugpsDate(value: string | null | undefined): EqugpsDateNormalization {
  if (value === null || value === undefined) {
    return { status: "missing", original: value, date: undefined };
  }

  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return { status: "recognized", original: value, date: new Date(parsed) };
  }

  const localDate = parseLocalDateTime(value);
  if (localDate) {
    return { status: "recognized", original: value, date: localDate };
  }

  return { status: "unrecognized", original: value, date: undefined };
}

export type EqugpsDateFormatDiagnostic = {
  length: number;
  structuralMask: string;
  hasT: boolean;
  hasDateTimeSpace: boolean;
  hasZ: boolean;
  hasTimezoneOffset: boolean;
};

export function describeEqugpsDateFormat(value: string): EqugpsDateFormatDiagnostic {
  return {
    length: value.length,
    structuralMask: value.replace(/\d/g, "0"),
    hasT: value.includes("T"),
    hasDateTimeSpace: /^\d{4}-\d{2}-\d{2}\s+\d/.test(value),
    hasZ: value.includes("Z"),
    hasTimezoneOffset: /[+-]\d{2}:?\d{2}$/.test(value),
  };
}
