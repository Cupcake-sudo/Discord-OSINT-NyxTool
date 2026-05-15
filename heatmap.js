const fs   = require('fs');
const path = require('path');
const { SYSTEM_TZ } = require('./constants');
const { catTypeLine, delay } = require('./terminal');

function getLocalHour(isoTimestamp) {
  const date         = new Date(isoTimestamp);
  const localHourStr = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', hour12: false, timeZone: SYSTEM_TZ,
  }).format(date);
  return parseInt(localHourStr, 10) % 24;
}

function formatAMPM(hour) {
  if (hour === 0)  return '12am';
  if (hour < 12)  return hour + 'am';
  if (hour === 12) return '12pm';
  return (hour - 12) + 'pm';
}

function buildHeatmap(messages) {
  const buckets = Array.from({ length: 24 }, (_, i) => ({
    startHour: i,
    label:     formatAMPM(i),
    count:     0,
  }));
  for (const msg of messages) {
    if (!msg.timestamp) continue;
    const hour = getLocalHour(msg.timestamp);
    if (hour >= 0 && hour < 24) buckets[hour].count++;
  }
  return buckets.sort((a, b) => b.count - a.count);
}

function makeBar(count, max) {
  const BAR_WIDTH = 28;
  const filled    = max === 0 ? 0 : Math.round((count / max) * BAR_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}

async function printAndSaveHeatmap(messages, outDir, username) {
  if (!messages || messages.length === 0) return;

  const sorted   = buildHeatmap(messages);
  const top5     = sorted.slice(0, 5);
  const maxCount = top5[0] ? top5[0].count : 0;

  await catTypeLine('  ━━  HEATMAP  (' + SYSTEM_TZ + ', 1-hour windows)  ━━', { charDelay: 8 });

  for (let i = 0; i < top5.length; i++) {
    const b   = top5[i];
    const bar = makeBar(b.count, maxCount);
    const row = '  #' + (i + 1) + '  ' + b.label.padEnd(5) + '  │' + bar + '│  ' + String(b.count).padStart(4) + ' msg(s)';
    await catTypeLine(row, { charDelay: 6 });
    await delay(30);
  }

  const allSorted = buildHeatmap(messages);
  const fullTop5  = allSorted.slice(0, 5);
  const fileMax   = fullTop5[0] ? fullTop5[0].count : 0;

  let txt = 'DISCORD OSINT — ACTIVITY HEATMAP\n' + '═'.repeat(64) + '\n\n';
  txt += '  User      : ' + username + '\n';
  txt += '  Timezone  : ' + SYSTEM_TZ + '\n';
  txt += '  Window    : 1-hour buckets\n';
  txt += '  Total msgs: ' + messages.length + '\n\n';
  txt += '═'.repeat(64) + '\n\n';
  txt += '  TOP 5 PEAK WINDOWS\n  ' + '─'.repeat(60) + '\n\n';

  for (let i = 0; i < fullTop5.length; i++) {
    const b   = fullTop5[i];
    const bar = makeBar(b.count, fileMax);
    txt += '  #' + (i + 1) + '  ' + b.label + '\n';
    txt += '       │' + bar + '│  ' + b.count + ' msg(s)\n\n';
  }

  txt += '═'.repeat(64) + '\n\n';
  txt += '  ALL WINDOWS\n  ' + '─'.repeat(60) + '\n\n';

  const byHour = [...allSorted].sort((a, b) => a.startHour - b.startHour);
  const allMax = byHour.reduce((m, b) => Math.max(m, b.count), 0);
  for (const b of byHour) {
    const bar = makeBar(b.count, allMax);
    txt += '  ' + b.label.padEnd(5) + '  │' + bar + '│  ' + String(b.count).padStart(4) + ' msg(s)\n';
  }
  txt += '\n' + '═'.repeat(64) + '\n';

  fs.writeFileSync(path.join(outDir, 'heatmap.txt'), txt);

  const byHourChron = [...allSorted].sort((a, b) => a.startHour - b.startHour);
  fs.writeFileSync(path.join(outDir, 'heatmap.json'), JSON.stringify({
    user: username, timezone: SYSTEM_TZ, total: messages.length,
    buckets: byHourChron,
  }, null, 2));
}

function buildTimeline(messages) {
  const counts = {};
  for (const msg of messages) {
    if (!msg.timestamp) continue;
    const d   = new Date(msg.timestamp);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    counts[key] = (counts[key] || 0) + 1;
  }
  const keys = Object.keys(counts).sort();
  if (!keys.length) return [];
  const [sy, sm] = keys[0].split('-').map(Number);
  const [ey, em] = keys[keys.length - 1].split('-').map(Number);
  const result = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const key = y + '-' + String(m).padStart(2, '0');
    result.push({ month: key, count: counts[key] || 0 });
    if (++m > 12) { m = 1; y++; }
  }
  return result;
}

function saveTimeline(messages, outDir, username) {
  if (!messages || !messages.length) return;
  const buckets = buildTimeline(messages);
  if (!buckets.length) return;
  fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({
    user: username, total: messages.length, buckets,
  }, null, 2));
}

module.exports = { printAndSaveHeatmap, saveTimeline };
