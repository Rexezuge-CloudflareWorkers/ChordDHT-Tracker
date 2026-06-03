-- v4.0: Virtual node (vnode) support
ALTER TABLE nodes ADD COLUMN vnode_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS vnodes (
    vnode_id    TEXT NOT NULL PRIMARY KEY,
    anchor_id   TEXT NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
    vnode_index INTEGER NOT NULL,
    proof_json  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ACTIVE',
    last_seen   INTEGER NOT NULL,
    UNIQUE(anchor_id, vnode_index)
);

CREATE INDEX IF NOT EXISTS idx_vnodes_anchor ON vnodes(anchor_id);
