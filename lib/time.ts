/**
 * Time format utilities for FORGE.
 * Used to validate workStart / workEnd fields on User.
 */

/**
 * Returns true if the string matches strict HH:MM format.
 * Hours: 00–23. Minutes: 00–59.
 * Examples: "09:00" ✓  "23:59" ✓  "9:00" ✗  "24:00" ✗
 */
export function isValidTimeFormat(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time)
}
