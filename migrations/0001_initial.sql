CREATE TABLE IF NOT EXISTS nodes (
  node_id               TEXT    PRIMARY KEY,
  uri                   TEXT    NOT NULL,
  status                TEXT    NOT NULL DEFAULT 'ACTIVE',
  joined_at             TEXT    NOT NULL,
  last_seen             TEXT    NOT NULL,
  report_count          INTEGER NOT NULL DEFAULT 0,
  successor_id          TEXT,
  predecessor_id        TEXT,
  successor_list_size   INTEGER,
  finger_table_coverage REAL,
  uptime_seconds        INTEGER,
  maintenance_cycles    INTEGER
);

CREATE TABLE IF NOT EXISTS tracker_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
