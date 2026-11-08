// Monotone cubic Hermite interpolation: continuous velocity without overshoot.
// In particular a camera must never overshoot a close-up into the car's body.
export function prepareTimeline(keys, properties) {
  const tangents = keys.map(() => ({}));
  for (const property of properties) {
    const slopes = keys.slice(1).map((key, i) =>
      (key.state[property] - keys[i].state[property]) / (key.at - keys[i].at));
    keys.forEach((key, i) => {
      let tangent = 0;
      if (i > 0 && i < keys.length - 1 && slopes[i - 1] * slopes[i] > 0) {
        const before = key.at - keys[i - 1].at;
        const after = keys[i + 1].at - key.at;
        const a = 2 * after + before, b = after + 2 * before;
        tangent = (a + b) / (a / slopes[i - 1] + b / slopes[i]);
      }
      tangents[i][property] = tangent;
    });
  }
  return {keys, properties, tangents};
}

export function sampleTimeline(timeline, position) {
  const {keys, properties, tangents} = timeline;
  if (position <= keys[0].at) return {...keys[0].state};
  if (position >= keys.at(-1).at) return {...keys.at(-1).state};
  let i = 0;
  while (keys[i + 1].at < position) i++;
  const left = keys[i], right = keys[i + 1], distance = right.at - left.at;
  const t = (position - left.at) / distance, t2 = t * t, t3 = t2 * t;
  const result = {};
  for (const p of properties) {
    result[p] = (2*t3-3*t2+1)*left.state[p] + (t3-2*t2+t)*distance*tangents[i][p]
      + (-2*t3+3*t2)*right.state[p] + (t3-t2)*distance*tangents[i+1][p];
  }
  return result;
}
