Generated from packages/ingest/src/model; do not edit.

# Indexes

## `otel_logs`

```sql
CREATE INDEX ix_logs_ts IF NOT EXISTS ON `otel`.`default`.`otel_logs`(`Timestamp` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_logs_svc_ts IF NOT EXISTS ON `otel`.`default`.`otel_logs`(`ServiceName`, `Timestamp` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_logs_sev_ts IF NOT EXISTS ON `otel`.`default`.`otel_logs`(`SeverityText`, `Timestamp` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_logs_trace IF NOT EXISTS ON `otel`.`default`.`otel_logs`(`TraceId`) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_logs_session IF NOT EXISTS ON `otel`.`default`.`otel_logs`(`__hdx_materialized_session.id`, `Timestamp` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_logs_logattr_keys IF NOT EXISTS ON `otel`.`default`.`otel_logs`(DISTINCT ARRAY k FOR k IN OBJECT_NAMES(`LogAttributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_logs_logattr_items IF NOT EXISTS ON `otel`.`default`.`otel_logs`(DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`LogAttributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_logs_resattr_keys IF NOT EXISTS ON `otel`.`default`.`otel_logs`(DISTINCT ARRAY k FOR k IN OBJECT_NAMES(`ResourceAttributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_logs_resattr_items IF NOT EXISTS ON `otel`.`default`.`otel_logs`(DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`ResourceAttributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

```json
{
  "type": "fulltext-index",
  "name": "fts_otel_logs",
  "sourceType": "gocbcore",
  "sourceName": "otel",
  "planParams": {
    "indexPartitions": 6,
    "numReplicas": 0
  },
  "params": {
    "doc_config": {
      "mode": "scope.collection.type_field",
      "type_field": "type"
    },
    "mapping": {
      "default_analyzer": "standard",
      "default_datetime_parser": "dateTimeOptional",
      "default_mapping": {
        "enabled": false,
        "dynamic": false
      },
      "index_dynamic": false,
      "store_dynamic": false,
      "docvalues_dynamic": false,
      "types": {
        "default.otel_logs": {
          "enabled": true,
          "dynamic": false,
          "properties": {
            "Body": {
              "enabled": true,
              "dynamic": false,
              "fields": [
                {
                  "name": "Body",
                  "type": "text",
                  "analyzer": "standard",
                  "index": true
                }
              ]
            },
            "Timestamp": {
              "enabled": true,
              "dynamic": false,
              "fields": [
                {
                  "name": "Timestamp",
                  "type": "datetime",
                  "index": true,
                  "docvalues": true
                }
              ]
            },
            "ServiceName": {
              "enabled": true,
              "dynamic": false,
              "fields": [
                {
                  "name": "ServiceName",
                  "type": "text",
                  "analyzer": "keyword",
                  "index": true,
                  "docvalues": true
                }
              ]
            },
            "SeverityText": {
              "enabled": true,
              "dynamic": false,
              "fields": [
                {
                  "name": "SeverityText",
                  "type": "text",
                  "analyzer": "keyword",
                  "index": true,
                  "docvalues": true
                }
              ]
            }
          }
        }
      }
    },
    "store": {
      "indexType": "scorch"
    }
  }
}
```

## `otel_traces`

```sql
CREATE INDEX ix_traces_ts IF NOT EXISTS ON `otel`.`default`.`otel_traces`(`Timestamp` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_traces_svc_ts IF NOT EXISTS ON `otel`.`default`.`otel_traces`(`ServiceName`, `Timestamp` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_traces_svc_span_ts IF NOT EXISTS ON `otel`.`default`.`otel_traces`(`ServiceName`, `SpanName`, `Timestamp` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_traces_trace IF NOT EXISTS ON `otel`.`default`.`otel_traces`(`TraceId`, `Timestamp`) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_traces_session IF NOT EXISTS ON `otel`.`default`.`otel_traces`(`__hdx_materialized_rum.sessionId`, `Timestamp` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_traces_duration IF NOT EXISTS ON `otel`.`default`.`otel_traces`(`Duration`, `Timestamp` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_traces_spanattr_keys IF NOT EXISTS ON `otel`.`default`.`otel_traces`(DISTINCT ARRAY k FOR k IN OBJECT_NAMES(`SpanAttributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_traces_spanattr_items IF NOT EXISTS ON `otel`.`default`.`otel_traces`(DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`SpanAttributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_traces_resattr_keys IF NOT EXISTS ON `otel`.`default`.`otel_traces`(DISTINCT ARRAY k FOR k IN OBJECT_NAMES(`ResourceAttributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_traces_resattr_items IF NOT EXISTS ON `otel`.`default`.`otel_traces`(DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`ResourceAttributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

```json
{
  "type": "fulltext-index",
  "name": "fts_otel_traces",
  "sourceType": "gocbcore",
  "sourceName": "otel",
  "planParams": {
    "indexPartitions": 6,
    "numReplicas": 0
  },
  "params": {
    "doc_config": {
      "mode": "scope.collection.type_field",
      "type_field": "type"
    },
    "mapping": {
      "default_analyzer": "standard",
      "default_datetime_parser": "dateTimeOptional",
      "default_mapping": {
        "enabled": false,
        "dynamic": false
      },
      "index_dynamic": false,
      "store_dynamic": false,
      "docvalues_dynamic": false,
      "types": {
        "default.otel_traces": {
          "enabled": true,
          "dynamic": false,
          "properties": {
            "SpanName": {
              "enabled": true,
              "dynamic": false,
              "fields": [
                {
                  "name": "SpanName",
                  "type": "text",
                  "analyzer": "standard",
                  "index": true
                }
              ]
            },
            "Timestamp": {
              "enabled": true,
              "dynamic": false,
              "fields": [
                {
                  "name": "Timestamp",
                  "type": "datetime",
                  "index": true,
                  "docvalues": true
                }
              ]
            },
            "ServiceName": {
              "enabled": true,
              "dynamic": false,
              "fields": [
                {
                  "name": "ServiceName",
                  "type": "text",
                  "analyzer": "keyword",
                  "index": true,
                  "docvalues": true
                }
              ]
            }
          }
        }
      }
    },
    "store": {
      "indexType": "scorch"
    }
  }
}
```

## `otel_metrics_gauge`

```sql
CREATE INDEX ix_metrics_gauge_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_gauge`(`TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_gauge_name_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_gauge`(`MetricName`, `TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_gauge_svc_name_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_gauge`(`ServiceName`, `MetricName`, `TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_gauge_attr_items IF NOT EXISTS ON `otel`.`default`.`otel_metrics_gauge`(DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`Attributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

## `otel_metrics_sum`

```sql
CREATE INDEX ix_metrics_sum_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_sum`(`TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_sum_name_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_sum`(`MetricName`, `TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_sum_svc_name_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_sum`(`ServiceName`, `MetricName`, `TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_sum_attr_items IF NOT EXISTS ON `otel`.`default`.`otel_metrics_sum`(DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`Attributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

## `otel_metrics_histogram`

```sql
CREATE INDEX ix_metrics_histogram_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_histogram`(`TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_histogram_name_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_histogram`(`MetricName`, `TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_histogram_svc_name_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_histogram`(`ServiceName`, `MetricName`, `TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_histogram_attr_items IF NOT EXISTS ON `otel`.`default`.`otel_metrics_histogram`(DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`Attributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

## `otel_metrics_exponential_histogram`

```sql
CREATE INDEX ix_metrics_exponential_histogram_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_exponential_histogram`(`TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_exponential_histogram_name_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_exponential_histogram`(`MetricName`, `TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_exponential_histogram_svc_name_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_exponential_histogram`(`ServiceName`, `MetricName`, `TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_exponential_histogram_attr_items IF NOT EXISTS ON `otel`.`default`.`otel_metrics_exponential_histogram`(DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`Attributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

## `otel_metrics_summary`

```sql
CREATE INDEX ix_metrics_summary_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_summary`(`TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_summary_name_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_summary`(`MetricName`, `TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_summary_svc_name_ts IF NOT EXISTS ON `otel`.`default`.`otel_metrics_summary`(`ServiceName`, `MetricName`, `TimeUnix` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_metrics_summary_attr_items IF NOT EXISTS ON `otel`.`default`.`otel_metrics_summary`(DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`Attributes`) END) WITH {"defer_build": true, "num_replica": 0}
```

## `hyperdx_sessions`

```sql
CREATE INDEX ix_sessions_ts IF NOT EXISTS ON `otel`.`default`.`hyperdx_sessions`(`Timestamp` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_sessions_svc_ts IF NOT EXISTS ON `otel`.`default`.`hyperdx_sessions`(`ServiceName`, `Timestamp` DESC) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_sessions_session IF NOT EXISTS ON `otel`.`default`.`hyperdx_sessions`(`__hdx_materialized_session.id`, `Timestamp`) WITH {"defer_build": true, "num_replica": 0}
```

```sql
CREATE INDEX ix_sessions_rum_session IF NOT EXISTS ON `otel`.`default`.`hyperdx_sessions`(`__hdx_materialized_rum.sessionId`, `Timestamp`) WITH {"defer_build": true, "num_replica": 0}
```

