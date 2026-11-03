CREATE TABLE receipts(id TEXT PRIMARY KEY,received_at INTEGER NOT NULL,day TEXT NOT NULL,kind TEXT NOT NULL,note TEXT NOT NULL,value INTEGER NOT NULL);
CREATE INDEX receipts_time ON receipts(received_at);
CREATE TABLE daily(day TEXT NOT NULL,kind TEXT NOT NULL,note TEXT NOT NULL,events INTEGER NOT NULL DEFAULT 0,value INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,kind,note));
CREATE TRIGGER aggregate_receipt AFTER INSERT ON receipts BEGIN
 INSERT INTO daily(day,kind,note,events,value) VALUES(NEW.day,NEW.kind,NEW.note,1,NEW.value)
 ON CONFLICT(day,kind,note) DO UPDATE SET events=events+1,value=value+NEW.value;
END;
-- No visitor, session, note or event identifiers in diagnostics.
CREATE TABLE diagnostics(id INTEGER PRIMARY KEY,received_at INTEGER NOT NULL,ip TEXT NOT NULL,browser TEXT NOT NULL,platform TEXT NOT NULL,language TEXT NOT NULL,viewport TEXT NOT NULL);
CREATE INDEX diagnostics_time ON diagnostics(received_at);
