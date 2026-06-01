/**
 * Render one CSV cell safely.
 *
 * 1. Neutralise formula/CSV injection: a value beginning with = + - @ (or a
 *    tab/CR that some parsers treat as a formula lead-in) is prefixed with a
 *    single quote, so a lead-supplied field like `=HYPERLINK(...)` can't
 *    execute when the agent opens the export in Excel/Sheets.
 * 2. RFC-4180-quote when the value contains a quote, comma, or newline.
 */
export function csvCell(value: string): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
