-- Coarse traffic context only: referrer host (no path or query) and country code.
-- Country is written only when the visitor has enabled environment sharing.
ALTER TABLE visitor_events ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE visitor_events ADD COLUMN referrer TEXT NOT NULL DEFAULT '';
ALTER TABLE diagnostics ADD COLUMN country TEXT NOT NULL DEFAULT '';
CREATE TABLE traffic(day TEXT NOT NULL,kind TEXT NOT NULL,label TEXT NOT NULL,events INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,kind,label));
CREATE INDEX traffic_day ON traffic(day);
