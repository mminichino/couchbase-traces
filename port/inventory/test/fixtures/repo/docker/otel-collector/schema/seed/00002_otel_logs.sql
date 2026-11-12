-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS ${DATABASE}.otel_logs
(
  `Timestamp` DateTime64(9) CODEC(Delta, ZSTD(1)),
  `Body` String CODEC(ZSTD(1)),
  `TimestampTime` DateTime DEFAULT toDateTime(Timestamp),
  `Hash` UInt64 MATERIALIZED cityHash64(Body),
  `Upper` String ALIAS upper(Body),
  INDEX idx_body Body TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 8,
  INDEX idx_ts Timestamp TYPE minmax GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toDate(TimestampTime)
ORDER BY (ServiceName, TimestampTime)
TTL TimestampTime + toIntervalDay(3)
SETTINGS index_granularity = 8192;
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS ${DATABASE}.otel_logs;
