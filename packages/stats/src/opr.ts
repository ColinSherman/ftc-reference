/**
 * Offensive Power Rating via least squares: each alliance result is modelled as the sum of its
 * teams' contributions. Solves (AᵀA + λI) x = Aᵀb with Cholesky; λ is a tiny ridge so events
 * with too few matches (singular AᵀA) still produce sensible numbers.
 */
export interface AllianceObs {
  teams: number[];
  /** One value per component, e.g. [np, auto, teleop, …]. */
  values: number[];
}

export function computeOpr(obs: AllianceObs[], components: number, ridge = 1e-3): Map<number, number[]> {
  const teamIdx = new Map<number, number>();
  for (const o of obs) for (const t of o.teams) if (!teamIdx.has(t)) teamIdx.set(t, teamIdx.size);
  const n = teamIdx.size;
  const out = new Map<number, number[]>();
  if (n === 0) return out;

  // Normal equations: M = AᵀA (n×n), R = Aᵀb (n×components).
  const M = new Float64Array(n * n);
  const R = new Float64Array(n * components);
  for (const o of obs) {
    const idx = o.teams.map((t) => teamIdx.get(t) as number);
    for (const i of idx) {
      for (const j of idx) M[i * n + j] = (M[i * n + j] as number) + 1;
      for (let c = 0; c < components; c++)
        R[i * components + c] = (R[i * components + c] as number) + (o.values[c] ?? 0);
    }
  }
  for (let i = 0; i < n; i++) M[i * n + i] = (M[i * n + i] as number) + ridge;

  const L = cholesky(M, n);
  for (const team of teamIdx.keys()) out.set(team, new Array(components).fill(0));
  for (let c = 0; c < components; c++) {
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) b[i] = R[i * components + c] as number;
    const x = choleskySolve(L, n, b);
    for (const [team, i] of teamIdx) (out.get(team) as number[])[c] = x[i] as number;
  }
  return out;
}

function cholesky(A: Float64Array, n: number): Float64Array {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * n + j] as number;
      for (let k = 0; k < j; k++) sum -= (L[i * n + k] as number) * (L[j * n + k] as number);
      if (i === j) L[i * n + i] = Math.sqrt(Math.max(sum, 1e-12));
      else L[i * n + j] = sum / (L[j * n + j] as number);
    }
  }
  return L;
}

function choleskySolve(L: Float64Array, n: number, b: Float64Array): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i] as number;
    for (let k = 0; k < i; k++) s -= (L[i * n + k] as number) * (y[k] as number);
    y[i] = s / (L[i * n + i] as number);
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i] as number;
    for (let k = i + 1; k < n; k++) s -= (L[k * n + i] as number) * (x[k] as number);
    x[i] = s / (L[i * n + i] as number);
  }
  return x;
}
