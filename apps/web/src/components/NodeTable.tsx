import React, { useState } from 'react';
import type { TrackerNodeRecord } from '../types';
import { truncateNodeId, formatRelativeTime } from '../utils';
import { STATUS_COLORS } from '../constants';

interface Props {
  nodes: TrackerNodeRecord[];
}

export function NodeTable({ nodes }: Props) {
  const [revealedUris, setRevealedUris] = useState<Set<string>>(new Set());
  const toggleUri = (id: string) =>
    setRevealedUris(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const sorted = [...nodes].sort(
    (a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 text-gray-500 text-sm">
        No nodes registered
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-gray-900">
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="pb-2 pr-4 font-medium">Node ID</th>
            <th className="pb-2 pr-4 font-medium">URI</th>
            <th className="pb-2 pr-4 font-medium">Status</th>
            <th className="pb-2 pr-4 font-medium">Last Seen</th>
            <th className="pb-2 font-medium">Reports</th>
          </tr>
          <tr>
            <td colSpan={5} className="pb-2">
              <div className="border-b border-gray-800" />
            </td>
          </tr>
        </thead>
        <tbody>
          {sorted.map((node) => {
            const color = STATUS_COLORS[node.status] ?? STATUS_COLORS['UNKNOWN'];
            return (
              <tr key={node.node_id} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                <td className="py-2 pr-4 font-mono text-xs text-gray-300 whitespace-nowrap">
                  {truncateNodeId(node.node_id)}
                </td>
                <td className="py-2 pr-4 text-xs text-gray-400 max-w-40 truncate">
                  {revealedUris.has(node.node_id) ? (
                    <span onClick={() => toggleUri(node.node_id)} className="cursor-pointer">
                      {node.uri.replace('https://', '')}
                    </span>
                  ) : (
                    <span onClick={() => toggleUri(node.node_id)} className="cursor-pointer italic text-gray-600 hover:text-gray-400">
                      [redacted]
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    {node.status}
                  </span>
                </td>
                <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">
                  {formatRelativeTime(node.last_seen)}
                </td>
                <td className="py-2 text-xs text-gray-500 tabular-nums">{node.report_count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
