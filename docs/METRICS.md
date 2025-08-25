# Metrics and Prometheus Quick Guide

This app exposes runtime and DB metrics in Prometheus format at the `/metrics` endpoint.

Important: The endpoint is restricted. Access is allowed only if:
- The request comes from an allowlisted IP (env: `METRICS_IP_ALLOWLIST`, falls back to `WHITELISTED_IPS`), or
- The requester is an authenticated admin user (session-based)

Do NOT append tokens to the metrics URL. Prefer IP allowlisting for your Prometheus server.

## Enable access

1) Add the Prometheus server's egress/public IP to `.env` on the app host.

Example:

```
METRICS_IP_ALLOWLIST=127.0.0.1,::1,203.0.113.42
```

2) Restart the app so the new allowlist is applied.

## Scrape with Prometheus

Production (HTTPS):

```yaml
scrape_configs:
  - job_name: 'panda-prod'
    scheme: https
    metrics_path: /metrics
    scrape_interval: 30s
    static_configs:
      - targets: ['purviewpanda.de']  # 443 by default
        labels:
          instance: 'panda-prod'
```

Local (HTTP, port 4000):

```yaml
scrape_configs:
  - job_name: 'panda-local'
    scheme: http
    metrics_path: /metrics
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:4000']
        labels:
          instance: 'panda-dev'
```

If your TLS is a valid public certificate (e.g., Let's Encrypt), you don't need extra TLS settings. If using self-signed certs, add:

```yaml
    tls_config:
      insecure_skip_verify: true
```

## Useful PromQL queries

- Total requests per minute (rate):
  
  `sum(rate(http_requests_total[1m]))`

- Client errors and server errors (rate):
  
  `sum(rate(http_client_errors_total[5m]))`  
  `sum(rate(http_server_errors_total[5m]))`

- 95th percentile HTTP latency:
  
  `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`

- Average DB query time (derived):
  
  `sum(rate(db_query_duration_seconds_sum[5m])) / sum(rate(db_query_duration_seconds_count[5m]))`

## Alert ideas (Alertmanager)

```yaml
groups:
- name: panda.rules
  rules:
  - alert: PandaHighErrorRate
    expr: sum(rate(http_server_errors_total[5m])) > 0
    for: 2m
    labels:
      severity: page
    annotations:
      summary: "Server errors observed"
  - alert: PandaHighLatencyP95
    expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 0.8
    for: 5m
    labels:
      severity: warn
    annotations:
      summary: "p95 request latency > 800ms"
```

## Security notes

- Prefer IP allowlisting (METRICS_IP_ALLOWLIST) instead of credentials in scrape URLs.
- If you need extra protection, place the app behind a reverse proxy (e.g., Nginx) and add HTTP basic auth at the proxy level—keep the Node endpoint private.
- Avoid exposing `/metrics` publicly. If you must, ensure your Prometheus server IP is static and allowlist only that IP.

## Manual checks (PowerShell)

```powershell
# Local (HTTP, may be 403 if not allowlisted)
Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:4000/metrics" | Select-Object -ExpandProperty Content

# Production (HTTPS, returns 403 unless your IP is allowlisted or you are logged in as admin)
Invoke-WebRequest -UseBasicParsing -Uri "https://purviewpanda.de/metrics" | Select-Object StatusCode
```
