/**
 * Cells for a Sports-Reference-style grouping row: `groups` holds one label per column, and
 * neighbouring columns with the same label share a cell. `lead` unlabelled columns (team,
 * record…) come first. Empty labels are gaps and never merge, so each stays one column wide.
 */
export function overRuns(lead: number, groups: string[]): [label: string, span: number][] {
  const runs: [string, number][] = lead > 0 ? [["", lead]] : [];
  for (const g of groups) {
    const last = runs[runs.length - 1];
    if (g && last?.[0] === g) last[1]++;
    else runs.push([g, 1]);
  }
  return runs;
}
