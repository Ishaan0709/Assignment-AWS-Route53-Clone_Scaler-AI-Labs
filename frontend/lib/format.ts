/** Returns `count noun` with a naive English plural, e.g. "1 record", "3 records". */
export function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}
