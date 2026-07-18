export function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function truncateNodeId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function nodeIdToAngle(nodeId: string): number {
  const MAX = BigInt('0x' + 'f'.repeat(40));
  const val = BigInt('0x' + nodeId);
  // Map [0, 2^160) → [0, 2π), then rotate so ID=0 starts at top
  return Number((val * BigInt(1_000_000)) / MAX) / 1_000_000 * 2 * Math.PI - Math.PI / 2;
}

export function formatUptime(seconds: number): string {
  const wholeSeconds = Math.floor(seconds);
  if (wholeSeconds < 60) return `${wholeSeconds}s`;
  if (wholeSeconds < 3600) return `${Math.floor(wholeSeconds / 60)}m ${wholeSeconds % 60}s`;
  if (wholeSeconds < 86400) {
    const h = Math.floor(wholeSeconds / 3600);
    const m = Math.floor((wholeSeconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(wholeSeconds / 86400);
  const h = Math.floor((wholeSeconds % 86400) / 3600);
  const m = Math.floor((wholeSeconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
