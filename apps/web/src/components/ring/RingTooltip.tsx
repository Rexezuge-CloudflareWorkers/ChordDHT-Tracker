import type { TrackerNodeRecord } from '../../types';
import { formatRelativeTime, nodeIdToAngle, truncateNodeId } from '../../utils';
import { STATUS_COLORS } from '../../constants';
import { avgRTT, positionForAngle, rttColor, tooltipPositionClass } from './RingTopology';

export interface VNodeTooltipState {
  vnodeId: string;
  vnodeIndex: number;
  anchor: TrackerNodeRecord;
}

interface NodeTooltipProps {
  node: TrackerNodeRecord | null;
  isAdmin: boolean;
  staleCutoff?: Date | null;
}

/**
Tooltip for a ring node — corner opposite the node's ring quadrant.
*/
export function RingNodeTooltip({ node, isAdmin, staleCutoff }: NodeTooltipProps) {
  if (!node) return null;
  const { x: nodeX, y: nodeY } = positionForAngle(nodeIdToAngle(node.node_id));
  const posClass = tooltipPositionClass(nodeX, nodeY);
  const isStaleTooltip = staleCutoff != null && node.last_seen !== null && new Date(node.last_seen) < staleCutoff;
  const tooltipStatus = isStaleTooltip ? 'STALE' : (node.status ?? 'UNKNOWN');
  const statusColor = node.status === null ? '#ffffff' : STATUS_COLORS[tooltipStatus] ?? STATUS_COLORS['UNKNOWN'];
  const avg = avgRTT(node.rtt_samples);
  const succListLen = node.successor_list?.length ?? null;
  const succListCap = node.successor_list_capacity;
  return (
    <div
      className={`absolute ${posClass} w-52 rounded-md border border-gray-700 bg-gray-800 p-2.5 text-xs font-mono pointer-events-none`}
      style={{ lineHeight: '1.6' }}
    >
      <div className="text-gray-100 truncate">{node.node_id.slice(0, 22)}…</div>
      {node.is_vnode && <div className="text-indigo-300">VNode #{node.vnode_index ?? '—'}</div>}
      {node.is_vnode && node.anchor_id && <div className="text-gray-500">Anchor: {truncateNodeId(node.anchor_id)}</div>}
      <div className="text-gray-400 truncate">{node.uri === null ? '******' : node.uri.replace('https://', '')}</div>
      <div style={{ color: statusColor }}>{tooltipStatus}</div>
      <div className="text-gray-500">Last seen: {node.last_seen === null ? '******' : formatRelativeTime(node.last_seen)}</div>
      <div className="text-gray-500">Reports: {node.report_count === null ? '******' : node.report_count}</div>
      <div className="text-gray-500">Successor: {node.successor_id ? truncateNodeId(node.successor_id) : isAdmin ? '—' : '******'}</div>
      <div className="text-gray-500">Predecessor: {node.predecessor_id ? truncateNodeId(node.predecessor_id) : isAdmin ? '—' : '******'}</div>
      <div className="text-gray-500">
        {succListLen !== null && succListCap !== null
          ? `Succ list: ${succListLen}/${succListCap}`
          : succListLen === null
            ? node.successor_list_size === null
              ? isAdmin ? 'Succ list: —' : ''
              : `Succ list: ${node.successor_list_size}${succListCap ? `/${succListCap}` : ''}`
            : `Succ list: ${succListLen}`}
      </div>
      {avg === null
        ? isAdmin ? <div className="text-gray-500">RTT: —</div> : null
        : <div style={{ color: rttColor(avg) }}>Avg RTT: {Math.round(avg)}ms</div>}
      {node.finger_table_coverage === null
        ? isAdmin ? <div className="text-gray-500">Finger: —</div> : null
        : <div className="text-gray-500">Finger coverage: {Math.round(node.finger_table_coverage * 100)}%</div>}
    </div>
  );
}

/**
Tooltip for an admin-only vnode dot (shows anchor instead of ring state).
*/
export function RingVNodeTooltip({ state }: { state: VNodeTooltipState | null }) {
  if (!state) return null;
  const { vnodeId, vnodeIndex, anchor } = state;
  const { x: vx, y: vy } = positionForAngle(nodeIdToAngle(vnodeId));
  const posClass = tooltipPositionClass(vx, vy);
  return (
    <div
      className={`absolute ${posClass} w-52 rounded-md border border-gray-700 bg-gray-800 p-2.5 text-xs font-mono pointer-events-none`}
      style={{ lineHeight: '1.6' }}
    >
      <div className="text-indigo-300 text-xs font-sans mb-1">VNode #{vnodeIndex}</div>
      <div className="text-gray-100 truncate">{vnodeId.slice(0, 22)}…</div>
      <div className="text-gray-500 mt-1">Anchor:</div>
      <div className="text-gray-300 truncate">{anchor.node_id.slice(0, 22)}…</div>
    </div>
  );
}
