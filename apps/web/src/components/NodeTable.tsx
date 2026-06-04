import React from 'react';
import type { TrackerNodeRecord } from '../types';
import { truncateNodeId, formatRelativeTime } from '../utils';
import { STATUS_COLORS } from '../constants';

interface Props {
  nodes: TrackerNodeRecord[];
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
  isAdmin: boolean;
  staleCutoff?: Date | null;
  emptyMessage?: string;
}

export function NodeTable({
  nodes,
  selectedNodeId,
  onNodeSelect,
  isAdmin,
  staleCutoff,
  emptyMessage = 'No nodes registered',
}: Props) {
  const sorted = [...nodes].sort(
    (a, b) => new Date(b.last_seen ?? 0).getTime() - new Date(a.last_seen ?? 0).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 text-gray-500 text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 max-h-[60vh]">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-gray-900">
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="pb-2 pr-4 font-medium">Node ID</th>
            <th className="pb-2 pr-4 font-medium">URI</th>
            <th className="pb-2 pr-4 font-medium">Status</th>
            {isAdmin && <th className="pb-2 pr-4 font-medium">Region</th>}
            {isAdmin && <th className="pb-2 pr-4 font-medium">VNodes</th>}
            <th className="pb-2 pr-4 font-medium">Last Seen</th>
            <th className="pb-2 font-medium">Reports</th>
          </tr>
          <tr>
            <td colSpan={isAdmin ? 7 : 5} className="pb-2">
              <div className="border-b border-gray-800" />
            </td>
          </tr>
        </thead>
        <tbody>
          {sorted.map((node) => {
            const isStale = staleCutoff != null && node.last_seen !== null && new Date(node.last_seen) < staleCutoff;
            const displayStatus = isStale ? 'STALE' : (node.status ?? 'UNKNOWN');
            const color = STATUS_COLORS[displayStatus] ?? STATUS_COLORS['UNKNOWN'];
            const isSelected = selectedNodeId === node.node_id;
            return (
              <tr
                key={node.node_id}
                onClick={() => onNodeSelect(node.node_id)}
                className={`border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors cursor-pointer${isSelected ? ' bg-indigo-900/20 ring-1 ring-inset ring-indigo-500/30' : ''}`}
              >
                <td className="py-2 pr-4 font-mono text-xs text-gray-300 whitespace-nowrap">
                  {truncateNodeId(node.node_id)}
                  {node.is_vnode && (
                    <span className="ml-1 font-sans text-[10px] uppercase tracking-wide text-indigo-400">vnode</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-xs text-gray-400 max-w-40 truncate">
                  {node.uri === null
                    ? <span className="font-mono text-gray-600">{'******'}</span>
                    : node.uri.replace('https://', '')}
                </td>
                <td className="py-2 pr-4">
                  {node.status === null
                    ? <span className="font-mono text-gray-600">{'******'}</span>
                    : (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                        style={{ backgroundColor: `${color}22`, color }}
                      >
                        {displayStatus}
                      </span>
                    )}
                </td>
                {isAdmin && (
                  <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">
                    {node.region ?? '—'}
                  </td>
                )}
                {isAdmin && (
                  <td className="py-2 pr-4 text-xs text-gray-500 tabular-nums">
                    {node.is_vnode
                      ? <span className="px-1.5 py-0.5 rounded bg-indigo-900/30 text-indigo-300 text-xs">#{node.vnode_index ?? '—'}</span>
                      : (node.vnode_count ?? 0) > 0
                      ? <span className="px-1.5 py-0.5 rounded bg-indigo-900/30 text-indigo-300 text-xs">{node.vnode_count}</span>
                      : '—'}
                  </td>
                )}
                <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">
                  {node.last_seen !== null
                    ? formatRelativeTime(node.last_seen)
                    : <span className="font-mono text-gray-600">{'******'}</span>}
                </td>
                <td className="py-2 text-xs text-gray-500 tabular-nums">
                  {node.report_count !== null ? node.report_count : <span className="font-mono text-gray-600">{'******'}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
