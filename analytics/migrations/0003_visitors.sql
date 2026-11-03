CREATE TABLE visitor_events (
 id TEXT PRIMARY KEY,
 visitor TEXT NOT NULL,
 session TEXT NOT NULL,
 received_at INTEGER NOT NULL,
 at INTEGER NOT NULL,
 kind TEXT NOT NULL,
 note TEXT NOT NULL,
 value INTEGER NOT NULL,
 ip TEXT NOT NULL DEFAULT '',
 browser TEXT NOT NULL DEFAULT ''
);
CREATE INDEX visitor_events_visitor_time ON visitor_events(visitor,received_at);
CREATE INDEX visitor_events_time ON visitor_events(received_at);
