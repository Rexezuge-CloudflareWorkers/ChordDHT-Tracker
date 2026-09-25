import React from 'react';
import type { TrackerNodeRecord } from '../../types';
import { nodeIdToAngle, truncateNodeId } from '../../utils';
import { STATUS_COLORS } from '../../constants';
import {
  CX, CY, RING_R, DOT_R, VNODE_DOT_R, avgRTT, lineVis,
  nodeDotRadius, nodePosition, rttColor, shrinkToward, vnodePosition,
} from './RingTopology';
import type { LayerKey, Point, Viewport } from './RingTopology';
import type { RingData } from './useRingData';
import type { VNodeTooltipState } from './RingTooltip';

export interface RingCanvasProps {
  nodes: TrackerNodeRecord[];
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
  isAdmin: boolean;
  staleCutoff?: Date | null;
  data: RingData;
  viewport: Viewport;
  svgRef: React.RefObject<SVGSVGElement | null>;
  isDragging: boolean;
  draggedRef: { current: boolean };
  onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  hoveredNodeId: string | null;
  hoveredVnodeId: string | null;
  onNodeEnter: (node: TrackerNodeRecord) => void;
  onNodeLeave: () => void;
  onVnodeChange: (state: VNodeTooltipState | null) => void;
  visibleLayers: Record<LayerKey, boolean>;
  onToggleLayer: (key: LayerKey) => void;
  onZoomBy: (factor: number) => void;
  onResetViewport: () => void;
}

/**
SVG ring plot plus zoom controls and layer toggles (no tooltip state).
*/
export function RingCanvas({
  nodes, selectedNodeId, onNodeSelect, isAdmin, staleCutoff, data,
  viewport, svgRef, isDragging, draggedRef,
  onMouseDown, onMouseMove, onMouseUp, onMouseLeave,
  hoveredNodeId, hoveredVnodeId, onNodeEnter, onNodeLeave, onVnodeChange,
  visibleLayers, onToggleLayer, onZoomBy, onResetViewport,
}: RingCanvasProps) {
  const { nodeIdSet, angleMap, nodeMap, logicalVNodeIdSet, vnodeEntries, hoveredNode } = data;
  const { zoom, panX, panY } = viewport;

  function nodePos(id: string): Point | null {
    return nodePosition(angleMap, id);
  }

  function nodeRadius(id: string): number {
    return nodeDotRadius(nodeMap.get(id)?.is_vnode);
  }

  return (
    <>
      <svg
        ref={svgRef}
        viewBox="0 0 600 600"
        className="w-full"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
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

        <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
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
          {visibleLayers.backupSuccessors && nodes.map((node) => {
            if (!node.successor_list || node.successor_list.length <= 1) return null;
            // successor_list[0] is the primary (same as successor_id), draw [1:]
            return node.successor_list.slice(1).map((targetId) => {
              if (!nodeIdSet.has(targetId) || targetId === node.node_id) return null;
              const from = nodePos(node.node_id);
              const to = nodePos(targetId);
              if (!from || !to) return null;
              const end = shrinkToward(from.x, from.y, to.x, to.y, nodeRadius(targetId) + 3);
              const rtt = node.rtt_samples?.[targetId] ?? null;
              const color = rttColor(rtt, 0.55);
              const opacity = lineVis(hoveredNodeId, node.node_id, targetId, 1, 0.04);
              return (
                <line key={`succ-backup-${node.node_id}-${targetId}`}
                  x1={from.x} y1={from.y} x2={end.x} y2={end.y}
                  stroke={color} strokeWidth={0.8} opacity={opacity}
                  markerEnd="url(#arrow-thin)" style={{ pointerEvents: 'none' }} />
              );
            });
          })}

          {/* ── Layer 2: Primary successor lines (thick, RTT-colored) ── */}
          {visibleLayers.primarySuccessor && nodes.map((node) => {
            if (!node.successor_id || !nodeIdSet.has(node.successor_id) || (node.successor_id === node.node_id)) return null;
            const from = nodePos(node.node_id);
            const to = nodePos(node.successor_id);
            if (!from || !to) return null;
            const end = shrinkToward(from.x, from.y, to.x, to.y, nodeRadius(node.successor_id) + 4);
            const rtt = node.rtt_samples?.[node.successor_id] ?? null;
            const isHovered = hoveredNodeId === node.node_id || hoveredNodeId === node.successor_id;
            const color = rttColor(rtt, isHovered ? 0.95 : 0.7);
            const opacity = lineVis(hoveredNodeId, node.node_id, node.successor_id, 1, 0.04);
            return (
              <line key={`succ-primary-${node.node_id}`}
                x1={from.x} y1={from.y} x2={end.x} y2={end.y}
                stroke={color} strokeWidth={isHovered ? 2.5 : 2} opacity={opacity}
                markerEnd="url(#arrow-primary)" style={{ pointerEvents: 'none' }} />
            );
          })}

          {/* ── Layer 3: Predecessor list lines (dashed, violet) ── */}
          {visibleLayers.predecessors && nodes.map((node) => {
            if (!node.predecessor_list || node.predecessor_list.length === 0) return null;
            return node.predecessor_list.map((predId) => {
              if (!nodeIdSet.has(predId) || predId === node.node_id) return null;
              const from = nodePos(node.node_id);
              const to = nodePos(predId);
              if (!from || !to) return null;
              const end = shrinkToward(from.x, from.y, to.x, to.y, nodeRadius(predId) + 3);
              const opacity = lineVis(hoveredNodeId, node.node_id, predId, 0.5, 0.03);
              return (
                <line key={`pred-${node.node_id}-${predId}`}
                  x1={from.x} y1={from.y} x2={end.x} y2={end.y}
                  stroke="#a78bfa" strokeWidth={0.8} strokeDasharray="4 3" opacity={opacity}
                  markerEnd="url(#arrow-dashed)" style={{ pointerEvents: 'none' }} />
              );
            });
          })}

          {/* ── Layer 4: Finger table paths (curved, hover-only) ── */}
          {visibleLayers.fingerTable && hoveredNode && hoveredNode.finger_nodes && (() => {
            const from = nodePos(hoveredNode.node_id);
            if (!from) return null;
            return hoveredNode.finger_nodes.map((fingerId) => {
              if (!nodeIdSet.has(fingerId) || fingerId === hoveredNode.node_id) return null;
              const to = nodePos(fingerId);
              if (!to) return null;
              const end = shrinkToward(from.x, from.y, to.x, to.y, nodeRadius(fingerId) + 3);
              const rtt = hoveredNode.rtt_samples?.[fingerId] ?? null;
              const color = rttColor(rtt, 0.75);
              return (
                <path key={`finger-${hoveredNode.node_id}-${fingerId}`}
                  d={`M ${from.x} ${from.y} Q ${CX} ${CY} ${end.x} ${end.y}`}
                  fill="none" stroke={color} strokeWidth={1}
                  markerEnd="url(#arrow-thin)" style={{ pointerEvents: 'none' }} />
              );
            });
          })()}

          {/* ── Layer 5: VNode spoke lines ── */}
          {isAdmin && visibleLayers.vnodes && vnodeEntries.map(({ vnodeId, anchor }) => {
            const from = nodePos(anchor.node_id);
            if (!from) return null;
            const to = vnodePosition(vnodeId);
            const isVnodeHovered = hoveredVnodeId === vnodeId || hoveredNodeId === vnodeId;
            const isAnchorHovered = hoveredNodeId === anchor.node_id;
            const isStaleSpoke = staleCutoff != null && anchor.last_seen !== null && new Date(anchor.last_seen) < staleCutoff;
            const spokeStatus = isStaleSpoke ? 'STALE' : (anchor.status ?? 'UNKNOWN');
            const color = STATUS_COLORS[spokeStatus] ?? STATUS_COLORS['UNKNOWN'];
            const opacity = (hoveredNodeId || hoveredVnodeId)
              ? (isAnchorHovered || isVnodeHovered ? 0.6 : 0.06)
              : 0.3;
            return (
              <line key={`vnode-spoke-${vnodeId}`}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={color} strokeWidth={0.7} strokeDasharray="3 3" opacity={opacity}
                style={{ pointerEvents: 'none' }} />
            );
          })}

          {/* ── Layer 6: VNode dots ── */}
          {isAdmin && visibleLayers.vnodes && vnodeEntries.map(({ vnodeId, index, anchor }) => {
            if (logicalVNodeIdSet.has(vnodeId)) return null;
            const { x, y } = vnodePosition(vnodeId);
            const isStale = staleCutoff != null && anchor.last_seen !== null && new Date(anchor.last_seen) < staleCutoff;
            const displayStatus = isStale ? 'STALE' : (anchor.status ?? 'UNKNOWN');
            const color = STATUS_COLORS[displayStatus] ?? STATUS_COLORS['UNKNOWN'];
            const isHovered = hoveredVnodeId === vnodeId;
            const isAnchorHovered = hoveredNodeId === anchor.node_id;
            const fillOpacity = (hoveredNodeId || hoveredVnodeId)
              ? (isHovered || isAnchorHovered ? 1 : 0.2)
              : 0.55;
            return (
              <g key={`vnode-dot-${vnodeId}`}>
                <circle
                  cx={x} cy={y} r={VNODE_DOT_R} fill={color} fillOpacity={fillOpacity}
                  stroke={isHovered ? '#ffffff' : '#101319'} strokeWidth={isHovered ? 1.5 : 1}
                  strokeOpacity={fillOpacity} style={{ cursor: 'pointer' }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseEnter={() => onVnodeChange({ vnodeId, vnodeIndex: index, anchor })}
                  onMouseLeave={() => onVnodeChange(null)}
                  onClick={() => { if (!draggedRef.current) onNodeSelect(anchor.node_id); }}
                />
              </g>
            );
          })}

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
            const dotR = node.is_vnode ? VNODE_DOT_R : DOT_R;

            return (
              <g key={node.node_id}>
                {/* RTT outer glow ring */}
                {avg !== null && (
                  <circle cx={x} cy={y} r={dotR + 5} fill="none" stroke={rttColor(avg)}
                    strokeWidth={2} opacity={0.35} style={{ pointerEvents: 'none' }} />
                )}
                {isSelected && (
                  <circle cx={x} cy={y} r={dotR + (avg === null ? 5 : 10)} fill="none"
                    stroke="#6366f1" strokeWidth={2} opacity={0.5} style={{ pointerEvents: 'none' }} />
                )}
                <circle
                  cx={x} cy={y} r={dotR} fill={color}
                  stroke={isSelected ? '#ffffff' : '#101319'}
                  strokeWidth={isSelected ? 2.5 : node.is_vnode ? 1.5 : 2}
                  fillOpacity={node.is_vnode ? 0.72 : 1}
                  style={{ cursor: 'pointer' }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseEnter={() => onNodeEnter(node)}
                  onMouseLeave={onNodeLeave}
                  onClick={() => { if (!draggedRef.current) onNodeSelect(node.node_id); }}
                />
                {nodes.length <= 24 && !node.is_vnode && (
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
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="flex items-center gap-1.5 px-2 mt-1 mb-0.5 text-xs text-gray-500">
        <span>Zoom</span>
        <button
          onClick={() => onZoomBy(1.25)}
          className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold leading-none flex items-center justify-center"
        >+</button>
        <button
          onClick={() => onZoomBy(1 / 1.25)}
          className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold leading-none flex items-center justify-center"
        >−</button>
        <span className="w-8 text-center tabular-nums">{zoom === 1 ? '1×' : `${zoom.toFixed(1)}×`}</span>
        {zoom !== 1 && (
          <button
            onClick={onResetViewport}
            className="px-1.5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 leading-none"
          >reset</button>
        )}
        <span className="text-gray-700 ml-1">· scroll to zoom · drag to pan</span>
      </div>

      {/* Legend / layer toggles */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-gray-500">
        {(
          [
            { key: 'primarySuccessor', label: 'Primary successor', icon: <svg width="24" height="8"><line x1="2" y1="4" x2="22" y2="4" stroke="rgba(99,102,241,0.7)" strokeWidth="2" /></svg> },
            { key: 'backupSuccessors', label: 'Backup successors', icon: <svg width="24" height="8"><line x1="2" y1="4" x2="22" y2="4" stroke="rgba(99,102,241,0.5)" strokeWidth="0.8" /></svg> },
            { key: 'predecessors',     label: 'Predecessors',      icon: <svg width="24" height="8"><line x1="2" y1="4" x2="22" y2="4" stroke="#a78bfa" strokeWidth="0.8" strokeDasharray="4 3" /></svg> },
            { key: 'fingerTable',      label: 'Finger table (hover)', icon: <svg width="24" height="8"><path d="M2,6 Q12,1 22,4" fill="none" stroke="rgba(99,102,241,0.7)" strokeWidth="1" /></svg> },
            { key: 'vnodes',           label: 'VNodes',    icon: <svg width="30" height="8"><circle cx="4" cy="4" r="3" fill="#6366f1" fillOpacity="0.55" stroke="#101319" strokeWidth="1" /><line x1="4" y1="4" x2="26" y2="4" stroke="#6366f1" strokeWidth="0.7" strokeDasharray="3 3" strokeOpacity="0.5" /><circle cx="26" cy="4" r="5" fill="#22c55e" stroke="#101319" strokeWidth="1.5" /></svg> },
          ] as { key: LayerKey; label: string; icon: React.ReactNode }[]
        ).filter(({ key }) => key !== 'vnodes' || isAdmin).map(({ key, label, icon }) => (
          <label
            key={key}
            className={`flex items-center gap-1 cursor-pointer transition-opacity ${visibleLayers[key] ? '' : 'opacity-35'}`}
          >
            <input
              type="checkbox"
              checked={visibleLayers[key]}
              onChange={() => onToggleLayer(key)}
              className="accent-indigo-500 cursor-pointer"
            />
            {icon}
            {label}
          </label>
        ))}
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
    </>
  );
}
