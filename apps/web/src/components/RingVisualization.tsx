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
const TOOLTIP_W = 210;
const TOOLTIP_H = 130;

const ARROW_MARKER_ID = 'chord-arrow';
const ARROW_MARKER_ID_HOVER = 'chord-arrow-hover';
const LINK_COLOR = 'rgba(99, 102, 241, 0.45)';
const LINK_COLOR_HOVER = 'rgba(165, 180, 252, 0.9)';

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

  return (
    <div className="relative select-none">
      <svg
        viewBox="0 0 600 600"
        className="w-full"
        onMouseLeave={() => { setTooltip(null); setHoveredNodeId(null); }}
      >
        <defs>
          <marker
            id={ARROW_MARKER_ID}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L0,6 L8,3 Z" fill={LINK_COLOR} />
          </marker>
          <marker
            id={ARROW_MARKER_ID_HOVER}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L0,6 L8,3 Z" fill={LINK_COLOR_HOVER} />
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

        {/* Successor chord lines */}
        {nodes.map((node) => {
          if (!node.successor_id || !nodeIdSet.has(node.successor_id)) return null;
          if (node.successor_id === node.node_id) return null;

          const fromAngle = angleMap.get(node.node_id)!;
          const toAngle = angleMap.get(node.successor_id)!;

          const x1 = CX + RING_R * Math.cos(fromAngle);
          const y1 = CY + RING_R * Math.sin(fromAngle);
          const x2 = CX + RING_R * Math.cos(toAngle);
          const y2 = CY + RING_R * Math.sin(toAngle);

          const dx = x2 - x1;
          const dy = y2 - y1;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1) return null;
          const shrink = (DOT_R + 2) / dist;
          const x2s = x2 - dx * shrink;
          const y2s = y2 - dy * shrink;

          const isHovered =
            hoveredNodeId === node.node_id || hoveredNodeId === node.successor_id;

          return (
            <line
              key={`succ-${node.node_id}`}
              x1={x1}
              y1={y1}
              x2={x2s}
              y2={y2s}
              stroke={isHovered ? LINK_COLOR_HOVER : LINK_COLOR}
              strokeWidth={isHovered ? 1.5 : 1}
              markerEnd={`url(#${isHovered ? ARROW_MARKER_ID_HOVER : ARROW_MARKER_ID})`}
              style={{ pointerEvents: 'none' }}
            />
          );
        })}

        {/* Node dots */}
        {nodes.map((node) => {
          const angle = nodeIdToAngle(node.node_id);
          const x = CX + RING_R * Math.cos(angle);
          const y = CY + RING_R * Math.sin(angle);
          const isStale = staleCutoff != null && node.last_seen !== null && new Date(node.last_seen) < staleCutoff;
          const displayStatus = isStale ? 'STALE' : (node.status ?? 'UNKNOWN');
          const color = node.status === null ? '#ffffff' : STATUS_COLORS[displayStatus] ?? STATUS_COLORS['UNKNOWN'];
          const isSelected = selectedNodeId === node.node_id;

          return (
            <g key={node.node_id}>
              {isSelected && (
                <circle
                  cx={x}
                  cy={y}
                  r={DOT_R + 5}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={2}
                  opacity={0.5}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              <circle
                cx={x}
                cy={y}
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
          const color = node.status === null ? '#ffffff' : STATUS_COLORS[tooltipStatus] ?? STATUS_COLORS['UNKNOWN'];
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={tx} y={ty} width={TOOLTIP_W} height={TOOLTIP_H} rx={6} fill="#1f2937" stroke="#374151" strokeWidth={1} />
              <text x={tx + 10} y={ty + 18} fontSize={10} fill="#f9fafb" fontFamily="monospace">
                {node.node_id.slice(0, 22)}…
              </text>
              <text x={tx + 10} y={ty + 34} fontSize={9} fill="#9ca3af" fontFamily="monospace">
                {node.uri !== null ? node.uri.replace('https://', '') : '******'}
              </text>
              <text x={tx + 10} y={ty + 50} fontSize={9} fill={color}>
                {tooltipStatus}
              </text>
              <text x={tx + 10} y={ty + 65} fontSize={9} fill="#6b7280">
                Last seen: {node.last_seen !== null ? formatRelativeTime(node.last_seen) : '******'}
              </text>
              <text x={tx + 10} y={ty + 80} fontSize={9} fill="#6b7280">
                Reports: {node.report_count !== null ? node.report_count : '******'}
              </text>
              <text x={tx + 10} y={ty + 97} fontSize={9} fill="#6b7280">
                Successor: {node.successor_id ? truncateNodeId(node.successor_id) : isAdmin ? '—' : '******'}
              </text>
              <text x={tx + 10} y={ty + 113} fontSize={9} fill="#6b7280">
                Predecessor: {node.predecessor_id ? truncateNodeId(node.predecessor_id) : isAdmin ? '—' : '******'}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
