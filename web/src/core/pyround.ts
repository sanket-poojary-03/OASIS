const f64 = new Float64Array(1);
const u64 = new BigUint64Array(f64.buffer);

/** Python `round(v, ndigits)` (ndigits >= 0): exact binary value, round-half-even. */
export function pyRound(v: number, ndigits: number): number {
  if (!Number.isFinite(v) || v === 0) return v;
  f64[0] = Math.abs(v);
  const bits = u64[0];
  const expBits = Number((bits >> 52n) & 0x7ffn);
  let m = bits & 0xfffffffffffffn;
  let e: number;
  if (expBits === 0) e = -1074; else { m |= 1n << 52n; e = expBits - 1075; }
  const scale = 10n ** BigInt(ndigits);
  const num = m * scale;
  let q: bigint;
  if (e >= 0) q = num << BigInt(e);
  else {
    const den = 1n << BigInt(-e);
    q = num / den;
    const twice = (num % den) * 2n;
    if (twice > den || (twice === den && q % 2n === 1n)) q += 1n;
  }
  const out = Number(q) / Number(scale);
  return v < 0 ? -out : out;
}
