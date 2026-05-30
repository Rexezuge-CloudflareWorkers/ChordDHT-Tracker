import React, { useState } from 'react';
import type { TrackerNodeRecord } from '../types';
import { nodeIdToAngle, truncateNodeId, formatRelativeTime } from '../utils';
import { STATUS_COLORS } from '../constants';

interface Props {
  nodes: TrackerNodeRecord[];
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
  isAdmin: boolean;
  staleCutoff?: Date | null;
}

interface TooltipState {
  svgX: number;
  svgY: number;
  node: TrackerNodeRecord;
}

const CX = 300;
const CY = 300;
const RING_R = 220;
const DOT_R = 8;
const TOOLTIP_W = 220;
const TOOLTIP_H = 165;

function rttColor(ms: number | undefined | null, alpha = 1): string {
  if (ms == null) return `rgba(99,102,241,${alpha})`;
  if (ms < 20) return `rgba(34,197,94,${alpha})`;
  if (ms < 100) return `rgba(234,179,8,${alpha})`;
  if (ms < 300) return `rgba(249,115,22,${alpha})`;
  return `rgba(239,68,68,${alpha})`;
}

function avgRTT(samples: Record<string, number> | null | undefined): number | null {
  if (!samples) return null;
  const vals = Object.values(samples);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function shrinkToward(
  x1: number, y1: number,
  x2: number, y2: number,
  shrinkPx: number,
): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return { x: x2, y: y2 };
  return { x: x2 - (dx / dist) * shrinkPx, y: y2 - (dy / dist) * shrinkPx };
}

function lineVis(hoveredId: string | null, sourceId: string, targetId: string, base: number, dim: number): number {
  if (!hoveredId) return base;
  return hoveredId === sourceId || hoveredId === targetId ? base : dim;
}

export function RingVisualization({ nodes, selectedNodeId, onNodeSelect, isAdmin, staleCutoff }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        No nodes registered
      </div>
    );
  }

  const nodeIdSet = new Set(nodes.map(n => n.node_id));
  const angleMap = new Map(nodes.map(n => [n.node_id, nodeIdToAngle(n.node_id)]));
  const nodeMap = new Map(nodes.map(n => [n.node_id, n]));

  const hoveredNode = hoveredNodeId ? nodeMap.get(hoveredNodeId) : undefined;

  function nodePos(id: string): { x: number; y: number } | null {
    const a = angleMap.get(id);
    if (a === undefined) return null;
    return { x: CX + RING_R * Math.cos(a), y: CY + RING_R * Math.sin(a) };
  }

  return (
    <div className="relative select-none">
      <svg
        viewBox="0 0 600 600"
        className="w-full"
        onMouseLeave={() => { setTooltip(null); setHoveredNodeId(null); }}
      >
        <defs>
          {/* context-stroke: arrowhead inherits the line's stroke color */}
          <marker id="arrow-primary" markerWidth="10" markerHeight="8" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L0,6 L9,3 Z" fill="context-stroke" />
          </marker>
          <marker id="arrow-thin" markerWidth="8" markerHeight="7" refX="7" refY="2.5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L0,5 L7,2.5 Z" fill="context-stroke" />
          </marker>
          <marker id="arrow-dashed" markerWidth="8" markerHeight="7" refX="7" refY="2.5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L0,5 L7,2.5 Z" fill="context-stroke" />
          </marker>
        </defs>

        {/* Ring */}
        <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke="#374151" strokeWidth={1.5} />

        {/* Cardinal tick marks */}
        {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((a, i) => (
          <line
            key={i}
            x1={CX + (RING_R - 7) * Math.cos(a - Math.PI / 2)}
            y1={CY + (RING_R - 7) * Math.sin(a - Math.PI / 2)}
            x2={CX + (RING_R + 7) * Math.cos(a - Math.PI / 2)}
            y2={CY + (RING_R + 7) * Math.sin(a - Math.PI / 2)}
            stroke="#4b5563"
            strokeWidth={1.5}
          />
        ))}

        {/* ID=0 label at top */}
        <text x={CX} y={CY - RING_R - 14} textAnchor="middle" fontSize={10} fill="#4b5563">
          0x0000…
        </text>

        {/* ── Layer 1: Backup successor lines (thin, RTT-colored) ── */}
        {nodes.map((node) => {
          if (!node.successor_list || node.successor_list.length <= 1) return null;
          // successor_list[0] is the primary (same as successor_id), draw [1:]
          return node.successor_list.slice(1).map((targetId) => {
            if (!nodeIdSet.has(targetId) || targetId === node.node_id) return null;
            const from = nodePos(node.node_id);
            const to = nodePos(targetId);
            if (!from || !to) return null;
            const end = shrinkToward(from.x, from.y, to.x, to.y, DOT_R + 3);
            const rtt = node.rtt_samples?.[targetId] ?? null;
            const color = rttColor(rtt, 0.55);
            const opacity = lineVis(hoveredNodeId, node.node_id, targetId, 1, 0.04);
            return (
              <line
                key={`succ-backup-${node.node_id}-${targetId}`}
                x1={from.x} y1={from.y}
                x2={end.x} y2={end.y}
                stroke={color}
                strokeWidth={0.8}
                opacity={opacity}
                markerEnd="url(#arrow-thin)"
                style={{ pointerEvents: 'none' }}
              />
            );
          });
        })}

        {/* ── Layer 2: Primary successor lines (thick, RTT-colored) ── */}
        {nodes.map((node) => {
          if (!node.successor_id || !nodeIdSet.has(node.successor_id)) return null;
          if (node.successor_id === node.node_id) return null;
          const from = nodePos(node.node_id);
          const to = nodePos(node.successor_id);
          if (!from || !to) return null;
          const end = shrinkToward(from.x, from.y, to.x, to.y, DOT_R + 4);
          const rtt = node.rtt_samples?.[node.successor_id] ?? null;
          const isHovered = hoveredNodeId === node.node_id || hoveredNodeId === node.successor_id;
          const color = rttColor(rtt, isHovered ? 0.95 : 0.7);
          const opacity = lineVis(hoveredNodeId, node.node_id, node.successor_id, 1, 0.04);
          return (
            <line
              key={`succ-primary-${node.node_id}`}
              x1={from.x} y1={from.y}
              x2={end.x} y2={end.y}
              stroke={color}
              strokeWidth={isHovered ? 2.5 : 2}
              opacity={opacity}
              markerEnd="url(#arrow-primary)"
              style={{ pointerEvents: 'none' }}
            />
          );
        })}

        {/* ── Layer 3: Predecessor list lines (dashed, violet) ── */}
        {nodes.map((node) => {
          if (!node.predecessor_list || node.predecessor_list.length === 0) return null;
          return node.predecessor_list.map((predId) => {
            if (!nodeIdSet.has(predId) || predId === node.node_id) return null;
            const from = nodePos(node.node_id);
            const to = nodePos(predId);
            if (!from || !to) return null;
            const end = shrinkToward(from.x, from.y, to.x, to.y, DOT_R + 3);
            const opacity = lineVis(hoveredNodeId, node.node_id, predId, 0.5, 0.03);
            return (
              <line
                key={`pred-${node.node_id}-${predId}`}
                x1={from.x} y1={from.y}
                x2={end.x} y2={end.y}
                stroke="#a78bfa"
                strokeWidth={0.8}
                strokeDasharray="4 3"
                opacity={opacity}
                markerEnd="url(#arrow-dashed)"
                style={{ pointerEvents: 'none' }}
              />
            );
          });
        })}

        {/* ── Layer 4: Finger table paths (curved, hover-only) ── */}
        {hoveredNode && hoveredNode.finger_nodes && (() => {
          const from = nodePos(hoveredNode.node_id);
          if (!from) return null;
          return hoveredNode.finger_nodes.map((fingerId) => {
            if (!nodeIdSet.has(fingerId) || fingerId === hoveredNode.node_id) return null;
            const to = nodePos(fingerId);
            if (!to) return null;
            const end = shrinkToward(from.x, from.y, to.x, to.y, DOT_R + 3);
            const rtt = hoveredNode.rtt_samples?.[fingerId] ?? null;
            const color = rttColor(rtt, 0.75);
            return (
              <path
                key={`finger-${hoveredNode.node_id}-${fingerId}`}
                d={`M ${from.x} ${from.y} Q ${CX} ${CY} ${end.x} ${end.y}`}
                fill="none"
                stroke={color}
                strokeWidth={1}
                markerEnd="url(#arrow-thin)"
                style={{ pointerEvents: 'none' }}
              />
            );
          });
        })()}

        {/* ── Node dots (including RTT glow ring) ── */}
        {nodes.map((node) => {
          const angle = nodeIdToAngle(node.node_id);
          const x = CX + RING_R * Math.cos(angle);
          const y = CY + RING_R * Math.sin(angle);
          const isStale = staleCutoff != null && node.last_seen !== null && new Date(node.last_seen) < staleCutoff;
          const displayStatus = isStale ? 'STALE' : (node.status ?? 'UNKNOWN');
          const color = node.status === null ? '#ffffff' : STATUS_COLORS[displayStatus] ?? STATUS_COLORS['UNKNOWN'];
          const isSelected = selectedNodeId === node.node_id;
          const avg = avgRTT(node.rtt_samples);

          return (
            <g key={node.node_id}>
              {/* RTT outer glow ring */}
              {avg !== null && (
                <circle
                  cx={x} cy={y}
                  r={DOT_R + 5}
                  fill="none"
                  stroke={rttColor(avg)}
                  strokeWidth={2}
                  opacity={0.35}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {isSelected && (
                <circle
                  cx={x} cy={y}
                  r={DOT_R + (avg !== null ? 10 : 5)}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={2}
                  opacity={0.5}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              <circle
                cx={x} cy={y}
                r={DOT_R}
                fill={color}
                stroke={isSelected ? '#ffffff' : '#101319'}
                strokeWidth={isSelected ? 2.5 : 2}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  const svg = (e.currentTarget as SVGElement).closest('svg')!;
                  const rect = svg.getBoundingClientRect();
                  const svgX = ((e.clientX - rect.left) / rect.width) * 600;
                  const svgY = ((e.clientY - rect.top) / rect.height) * 600;
                  setTooltip({ svgX, svgY, node });
                  setHoveredNodeId(node.node_id);
                }}
                onMouseLeave={() => setHoveredNodeId(null)}
                onClick={() => onNodeSelect(node.node_id)}
              />
              {nodes.length <= 24 && (
                <text
                  x={x + (x > CX ? DOT_R + 4 : -(DOT_R + 4))}
                  y={y + 4}
                  fontSize={9}
                  fill="#9ca3af"
                  textAnchor={x > CX ? 'start' : 'end'}
                  style={{ pointerEvents: 'none' }}
                >
                  {truncateNodeId(node.node_id)}
                </text>
              )}
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const { svgX, svgY, node } = tooltip;
          const tx = svgX + 14 + TOOLTIP_W > 595 ? svgX - TOOLTIP_W - 14 : svgX + 14;
          const ty = svgY + TOOLTIP_H > 585 ? svgY - TOOLTIP_H - 4 : svgY + 4;
          const isStaleTooltip = staleCutoff != null && node.last_seen !== null && new Date(node.last_seen) < staleCutoff;
          const tooltipStatus = isStaleTooltip ? 'STALE' : (node.status ?? 'UNKNOWN');
          const statusColor = node.status === null ? '#ffffff' : STATUS_COLORS[tooltipStatus] ?? STATUS_COLORS['UNKNOWN'];
          const avg = avgRTT(node.rtt_samples);
          const succListLen = node.successor_list?.length ?? null;
          const succListCap = node.successor_list_capacity;
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={tx} y={ty} width={TOOLTIP_W} height={TOOLTIP_H} rx={6} fill="#1f2937" stroke="#374151" strokeWidth={1} />
              <text x={tx + 10} y={ty + 18} fontSize={10} fill="#f9fafb" fontFamily="monospace">
                {node.node_id.slice(0, 22)}…
              </text>
              <text x={tx + 10} y={ty + 34} fontSize={9} fill="#9ca3af" fontFamily="monospace">
                {node.uri !== null ? node.uri.replace('https://', '') : '******'}
              </text>
              <text x={tx + 10} y={ty + 50} fontSize={9} fill={statusColor}>
                {tooltipStatus}
              </text>
              <text x={tx + 10} y={ty + 65} fontSize={9} fill="#6b7280">
                Last seen: {node.last_seen !== null ? formatRelativeTime(node.last_seen) : '******'}
              </text>
              <text x={tx + 10} y={ty + 80} fontSize={9} fill="#6b7280">
                Reports: {node.report_count !== null ? node.report_count : '******'}
              </text>
              <text x={tx + 10} y={ty + 95} fontSize={9} fill="#6b7280">
                Successor: {node.successor_id ? truncateNodeId(node.successor_id) : isAdmin ? '—' : '******'}
              </text>
              <text x={tx + 10} y={ty + 110} fontSize={9} fill="#6b7280">
                Predecessor: {node.predecessor_id ? truncateNodeId(node.predecessor_id) : isAdmin ? '—' : '******'}
              </text>
              <text x={tx + 10} y={ty + 125} fontSize={9} fill="#6b7280">
                {succListLen !== null && succListCap !== null
                  ? `Succ list: ${succListLen}/${succListCap}`
                  : succListLen !== null
                    ? `Succ list: ${succListLen}`
                    : node.successor_list_size !== null
                      ? `Succ list: ${node.successor_list_size}${succListCap ? `/${succListCap}` : ''}`
                      : isAdmin ? 'Succ list: —' : ''}
              </text>
              <text x={tx + 10} y={ty + 140} fontSize={9} fill={avg !== null ? rttColor(avg) : '#6b7280'}>
                {avg !== null ? `Avg RTT: ${Math.round(avg)}ms` : isAdmin ? 'RTT: —' : ''}
              </text>
              <text x={tx + 10} y={ty + 155} fontSize={9} fill="#6b7280">
                {node.finger_table_coverage !== null
                  ? `Finger coverage: ${Math.round(node.finger_table_coverage * 100)}%`
                  : isAdmin ? 'Finger: —' : ''}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 px-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <svg width="24" height="8"><line x1="2" y1="4" x2="22" y2="4" stroke="rgba(99,102,241,0.7)" strokeWidth="2" markerEnd="url(#arrow-primary)" /></svg>
          Primary successor
        </span>
        <span className="flex items-center gap-1">
          <svg width="24" height="8"><line x1="2" y1="4" x2="22" y2="4" stroke="rgba(99,102,241,0.5)" strokeWidth="0.8" /></svg>
          Backup successors
        </span>
        <span className="flex items-center gap-1">
          <svg width="24" height="8"><line x1="2" y1="4" x2="22" y2="4" stroke="#a78bfa" strokeWidth="0.8" strokeDasharray="4 3" /></svg>
          Predecessors
        </span>
        <span className="flex items-center gap-1">
          <svg width="24" height="8"><path d="M2,6 Q12,1 22,4" fill="none" stroke="rgba(99,102,241,0.7)" strokeWidth="1" /></svg>
          Finger table (hover)
        </span>
        <span className="flex items-center gap-1">
          <svg width="36" height="8">
            <line x1="0" y1="4" x2="8" y2="4" stroke="#22c55e" strokeWidth="2" />
            <line x1="10" y1="4" x2="18" y2="4" stroke="#eab308" strokeWidth="2" />
            <line x1="20" y1="4" x2="28" y2="4" stroke="#f97316" strokeWidth="2" />
            <line x1="30" y1="4" x2="36" y2="4" stroke="#ef4444" strokeWidth="2" />
          </svg>
          RTT &lt;20 / &lt;100 / &lt;300 / 300+ms
        </span>
      </div>
    </div>
  );
}
