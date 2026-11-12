-- +goose Up
CREATE TABLE IF NOT EXISTS ${DATABASE}.otel_logs_rollup
(
  `Timestamp` DateTime,
  `Count` UInt64
)
ENGINE = SummingMergeTree
ORDER BY Timestamp;

CREATE MATERIALIZED VIEW IF NOT EXISTS ${DATABASE}.otel_logs_rollup_mv
TO ${DATABASE}.otel_logs_rollup
AS SELECT
  toStartOfFiveMinutes(Timestamp) AS Timestamp,
  count() AS Count
FROM ${DATABASE}.otel_logs
GROUP BY Timestamp;

-- +goose Down
DROP VIEW IF EXISTS ${DATABASE}.otel_logs_rollup_mv;
