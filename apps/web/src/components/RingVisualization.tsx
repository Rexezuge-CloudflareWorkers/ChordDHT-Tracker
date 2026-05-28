import React, { useState } from 'react';
import type { TrackerNodeRecord } from '../types';
import { nodeIdToAngle, truncateNodeId, formatRelativeTime } from '../utils';
import { STATUS_COLORS } from '../constants';

interface Props {
  nodes: TrackerNodeRecord[];
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
const TOOLTIP_H = 96;

export function RingVisualization({ nodes }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        No nodes registered
      </div>
    );
  }

  return (
    <div className="relative select-none">
      <svg
        viewBox="0 0 600 600"
        className="w-full"
        onMouseLeave={() => setTooltip(null)}
      >
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

        {/* Node dots */}
        {nodes.map((node) => {
          const angle = nodeIdToAngle(node.node_id);
          const x = CX + RING_R * Math.cos(angle);
          const y = CY + RING_R * Math.sin(angle);
          const color = STATUS_COLORS[node.status] ?? STATUS_COLORS['UNKNOWN'];

          return (
            <g key={node.node_id}>
              <circle
                cx={x}
                cy={y}
                r={DOT_R}
                fill={color}
                stroke="#101319"
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  const svg = (e.currentTarget as SVGElement).closest('svg')!;
                  const rect = svg.getBoundingClientRect();
                  const svgX = ((e.clientX - rect.left) / rect.width) * 600;
                  const svgY = ((e.clientY - rect.top) / rect.height) * 600;
                  setTooltip({ svgX, svgY, node });
                }}
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
          const color = STATUS_COLORS[node.status] ?? STATUS_COLORS['UNKNOWN'];
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={tx} y={ty} width={TOOLTIP_W} height={TOOLTIP_H} rx={6} fill="#1f2937" stroke="#374151" strokeWidth={1} />
              <text x={tx + 10} y={ty + 18} fontSize={10} fill="#f9fafb" fontFamily="monospace">
                {node.node_id.slice(0, 22)}…
              </text>
              <text x={tx + 10} y={ty + 34} fontSize={9} fill="#9ca3af">
                [redacted]
              </text>
              <text x={tx + 10} y={ty + 50} fontSize={9} fill={color}>
                {node.status}
              </text>
              <text x={tx + 10} y={ty + 65} fontSize={9} fill="#6b7280">
                Last seen: {formatRelativeTime(node.last_seen)}
              </text>
              <text x={tx + 10} y={ty + 80} fontSize={9} fill="#6b7280">
                Reports: {node.report_count}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
