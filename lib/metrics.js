// Minimal in-process metrics (Prometheus-style exposition)
// Provides counters, gauges & histograms (simple bucket counts) without external deps.

const metrics = {
  counters: Object.create(null), // name -> value
  gauges: Object.create(null), // name -> value
  histograms: Object.create(null), // name -> { buckets: number[], counts:number[], sum:0, count:0 }
};

function inc(name, value = 1) {
  metrics.counters[name] = (metrics.counters[name] || 0) + value;
}
function setGauge(name, value) {
  metrics.gauges[name] = value;
}
function getGauge(name) {
  return Object.prototype.hasOwnProperty.call(metrics.gauges, name) ? metrics.gauges[name] : null;
}
function getCounter(name) {
  return Object.prototype.hasOwnProperty.call(metrics.counters, name) ? metrics.counters[name] : 0;
}
function observe(name, val, bucketBounds = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]) {
  // seconds buckets
  let h = metrics.histograms[name];
  if (!h) {
    h = { buckets: bucketBounds.slice(), counts: bucketBounds.map(() => 0), sum: 0, count: 0 };
    metrics.histograms[name] = h;
  }
  h.sum += val;
  h.count++;
  for (let i = 0; i < h.buckets.length; i++) {
    if (val <= h.buckets[i]) {
      h.counts[i]++;
      break;
    }
  }
}
function formatProm() {
  const lines = [];
  for (const [k, v] of Object.entries(metrics.counters)) {
    lines.push(`# TYPE ${k} counter`);
    lines.push(`${k} ${v}`);
  }
  for (const [k, v] of Object.entries(metrics.gauges)) {
    lines.push(`# TYPE ${k} gauge`);
    lines.push(`${k} ${v}`);
  }
  for (const [name, h] of Object.entries(metrics.histograms)) {
    lines.push(`# TYPE ${name} histogram`);
    let cumulative = 0;
    for (let i = 0; i < h.buckets.length; i++) {
      cumulative += h.counts[i];
      lines.push(`${name}_bucket{le="${h.buckets[i]}"} ${cumulative}`);
    }
    lines.push(`${name}_bucket{le="+Inf"} ${h.count}`);
    lines.push(`${name}_sum ${h.sum}`);
    lines.push(`${name}_count ${h.count}`);
  }
  return lines.join('\n');
}

module.exports = { inc, observe, setGauge, getGauge, getCounter, formatProm };
