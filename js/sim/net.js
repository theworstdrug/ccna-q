// IPv4 helpers shared by the simulator and the subnetting drill.

export function ipToInt(s) {
  if (typeof s !== 'string') return null;
  const p = s.trim().split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const o of p) {
    if (!/^\d{1,3}$/.test(o)) return null;
    const v = +o;
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function intToIp(n) {
  n = n >>> 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function isIp(s) { return ipToInt(s) !== null; }

export function prefixToMask(p) { return p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0; }

export function maskToPrefix(m) {
  // returns null if not a contiguous mask
  m = m >>> 0;
  let p = 0;
  while (p < 32 && (m & (0x80000000 >>> p))) p++;
  return prefixToMask(p) === m ? p : null;
}

export function isMask(s) { const m = ipToInt(s); return m !== null && maskToPrefix(m) !== null; }

export function network(ip, mask) { return (ip & mask) >>> 0; }
export function broadcast(ip, mask) { return ((ip & mask) | (~mask >>> 0)) >>> 0; }
export function sameSubnet(a, b, mask) { return network(a, mask) === network(b, mask); }
export function wildcardOf(mask) { return (~mask) >>> 0; }

export function usableHosts(prefix) {
  if (prefix >= 31) return prefix === 31 ? 2 : 1;
  return 2 ** (32 - prefix) - 2;
}

export function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
