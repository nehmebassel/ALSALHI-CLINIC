/** Presentation-only time layout: keeps clinical timestamps unchanged. */
export function measurementTimeLayout(dates: string[], left = 54, width = 842, minGap = 160) {
  const times = [...new Set(dates.map((date) => new Date(date).getTime()).filter(Number.isFinite))].sort((a, b) => a - b);
  const first = times[0] ?? 0;
  const last = times.at(-1) ?? first;
  const x = (time: number) => first === last ? left + width / 2 : left + (time - first) / (last - first) * width;
  if (times.length < 2) return { x, ticks: times };
  const ticks = [first];
  for (const time of times.slice(1, -1)) {
    if (x(time) - x(ticks.at(-1)!) >= minGap && x(last) - x(time) >= minGap) ticks.push(time);
  }
  ticks.push(last);
  return { x, ticks };
}
