import React, { useState, useEffect } from 'react';
import type { TrackerNodeRecord } from '../types';
import { truncateNodeId, formatRelativeTime, formatUptime } from '../utils';
import { STATUS_COLORS } from '../constants';

interface Props {
  node: TrackerNodeRecord;
  knownNodeIds: Set<string>;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
  isAdmin: boolean;
}

export function NodeDetailPanel({ node, knownNodeIds, onClose, onNavigate, isAdmin }: Props) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setCopied(false);
  }, [node.node_id]);

  const copyNodeId = () => {
    void navigator.clipboard.writeText(node.node_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const color = STATUS_COLORS[node.status ?? 'UNKNOWN'] ?? STATUS_COLORS['UNKNOWN'];
  const certExpiresAt = node.cert_expires_at != null ? new Date(node.cert_expires_at * 1000) : null;
  const certExpired = certExpiresAt != null && certExpiresAt < new Date();

  const cacheTotal = (node.cache_hits ?? 0) + (node.cache_misses ?? 0);
  const cacheHitRate = cacheTotal > 0 ? `${(((node.cache_hits ?? 0) / cacheTotal) * 100).toFixed(1)}%` : '—';
  const hasCacheData = node.cache_hits != null || node.cache_misses != null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full w-96 max-sm:w-full bg-gray-900 border-l border-gray-800 z-50 flex flex-col shadow-2xl transition-transform duration-200"
        style={{ transform: visible ? 'translateX(0)' : 'translateX(100%)' }}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Node Detail</p>
            <p className="font-mono text-sm text-white truncate">{truncateNodeId(node.node_id)}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer shrink-0 text-xl leading-none mt-0.5"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 flex-1 min-h-0 overflow-y-auto">
          <div>
            <SectionLabel>Node ID</SectionLabel>
            <button
              onClick={copyNodeId}
              title="Click to copy"
              className="w-full text-left font-mono text-xs text-gray-300 break-all bg-gray-800/60 rounded px-3 py-2 hover:bg-gray-800 transition-colors cursor-pointer"
            >
              {node.node_id}
              <span className="ml-2 text-gray-600 font-sans">{copied ? '✓ copied' : 'copy'}</span>
            </button>
          </div>

          <div>
            <SectionLabel>Status &amp; Timing</SectionLabel>
            <div className="space-y-1.5">
              <Row label="Status">
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: `${color}22`, color }}
                >
                  {node.status}
                </span>
              </Row>
              <Row label="Joined">
                {node.joined_at !== null ? new Date(node.joined_at).toLocaleString() : isAdmin ? <NullValue /> : <RedactedValue />}
              </Row>
              <Row label="Last Seen">
                {node.last_seen !== null ? formatRelativeTime(node.last_seen) : isAdmin ? <NullValue /> : <RedactedValue />}
              </Row>
              <Row label="Reports">
                {node.report_count !== null ? node.report_count.toLocaleString() : isAdmin ? <NullValue /> : <RedactedValue />}
              </Row>
              <Row label="Maint. Mode">
                {node.maintenance_mode != null ? (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={node.maintenance_mode === 'ACTIVE_MAINTENANCE'
                      ? { backgroundColor: '#f59e0b22', color: '#f59e0b' }
                      : { backgroundColor: '#6b728022', color: '#9ca3af' }}
                  >
                    {node.maintenance_mode === 'ACTIVE_MAINTENANCE' ? 'ACTIVE' : 'QUIET'}
                  </span>
                ) : isAdmin ? <NullValue /> : <RedactedValue />}
              </Row>
            </div>
          </div>

          <div>
            <SectionLabel>Connectivity</SectionLabel>
            <div className="space-y-1.5">
              <Row label="URI">
                {node.uri !== null
                  ? <span className="text-xs text-gray-300 break-all">{node.uri}</span>
                  : <RedactedValue />}
              </Row>
              <Row label="Region">
                {node.region != null
                  ? <span className="text-xs text-gray-300">{node.region}</span>
                  : isAdmin ? <NullValue /> : <RedactedValue />}
              </Row>
              <Row label="Successor List">
                {node.successor_list_size != null ? (
                  node.successor_list_capacity != null ? (
                    `${node.successor_list_size} / ${node.successor_list_capacity}`
                  ) : (
                    node.successor_list_size
                  )
                ) : isAdmin ? (
                  <NullValue />
                ) : (
                  <RedactedValue />
                )}
              </Row>
              <Row label="Predecessor List">
                {node.predecessor_list_size != null
                  ? node.predecessor_list_size
                  : isAdmin ? <NullValue /> : <RedactedValue />}
              </Row>
            </div>
          </div>

          <div>
            <SectionLabel>Ring Position</SectionLabel>
            <div className="space-y-1.5">
              <Row label="Successor">
                {node.successor_id
                  ? <NodeIdChip id={node.successor_id} knownNodeIds={knownNodeIds} onNavigate={onNavigate} />
                  : isAdmin ? <NullValue /> : <RedactedValue />}
              </Row>
              <Row label="Predecessor">
                {node.predecessor_id
                  ? <NodeIdChip id={node.predecessor_id} knownNodeIds={knownNodeIds} onNavigate={onNavigate} />
                  : isAdmin ? <NullValue /> : <RedactedValue />}
              </Row>
            </div>
          </div>

          <div>
            <SectionLabel>Performance</SectionLabel>
            <div className="space-y-1.5">
              <Row label="Uptime">
                {node.uptime_seconds != null ? formatUptime(node.uptime_seconds) : isAdmin ? <NullValue /> : <RedactedValue />}
              </Row>
              <Row label="Finger Coverage">
                {node.finger_table_coverage != null
                  ? `${(node.finger_table_coverage * 100).toFixed(1)}%`
                  : isAdmin ? <NullValue /> : <RedactedValue />}
              </Row>
              <Row label="Maintenance Cycles">
                {node.maintenance_cycles != null ? node.maintenance_cycles : isAdmin ? <NullValue /> : <RedactedValue />}
              </Row>
            </div>
          </div>

          {isAdmin && hasCacheData && (
            <div>
              <SectionLabel>Cache</SectionLabel>
              <div className="space-y-1.5">
                <Row label="Hit Rate">{cacheHitRate}</Row>
                <Row label="Hits">{(node.cache_hits ?? 0).toLocaleString()}</Row>
                <Row label="Misses">{(node.cache_misses ?? 0).toLocaleString()}</Row>
                <Row label="Size">{node.cache_size ?? <NullValue />}</Row>
              </div>
            </div>
          )}

          {(certExpiresAt != null || !isAdmin) && (
            <div>
              <SectionLabel>Certificate</SectionLabel>
              <div className="space-y-1.5">
                <Row label="Expires">
                  {certExpiresAt != null ? certExpiresAt.toLocaleString() : isAdmin ? <NullValue /> : <RedactedValue />}
                </Row>
                <Row label="Status">
                  {certExpiresAt != null ? (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={certExpired
                        ? { backgroundColor: '#f9731622', color: '#f97316' }
                        : { backgroundColor: '#22c55e22', color: '#22c55e' }}
                    >
                      {certExpired ? 'EXPIRED' : 'VALID'}
                    </span>
                  ) : <RedactedValue />}
                </Row>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">{children}</p>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-500 text-xs shrink-0 pt-0.5">{label}</span>
      <div className="text-gray-300 text-xs text-right">{children}</div>
    </div>
  );
}

function NodeIdChip({ id, knownNodeIds, onNavigate }: { id: string; knownNodeIds: Set<string>; onNavigate: (id: string) => void }) {
  if (knownNodeIds.has(id)) {
    return (
      <button
        onClick={() => onNavigate(id)}
        className="font-mono text-xs text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer transition-colors"
      >
        {truncateNodeId(id)}
      </button>
    );
  }
  return <span className="font-mono text-xs text-gray-400">{truncateNodeId(id)}</span>;
}

function NullValue() {
  return <span className="text-gray-600 text-xs">—</span>;
}

function RedactedValue() {
  return <span className="font-mono text-gray-600 text-xs">{'******'}</span>;
}
