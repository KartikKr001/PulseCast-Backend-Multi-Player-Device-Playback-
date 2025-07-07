/**
 * @typedef {{ x: number, y: number }} Position
 */

/**
 * @typedef {Object} GainParams
 * @property {Position} client
 * @property {Position} source
 * @property {number} [falloff]
 * @property {number} [minGain]
 * @property {number} [maxGain]
 */

/**
 * Calculates Euclidean distance between two positions
 * @param {Position} p1
 * @param {Position} p2
 * @returns {number}
 */
function calculateEuclideanDistance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates gain using exponential falloff
 */
export function gainFromDistanceExp({
  client,
  source,
  falloff = 0.05,
  minGain = 0.15,
  maxGain = 1.0,
}) {
  const distance = calculateEuclideanDistance(client, source);
  const gain = maxGain * Math.exp(-falloff * distance);
  return Math.max(minGain, gain);
}

/**
 * Calculates gain using linear falloff
 */
export function gainFromDistanceLinear({
  client,
  source,
  falloff = 0.01,
  minGain = 0.15,
  maxGain = 1.0,
}) {
  const distance = calculateEuclideanDistance(client, source);
  const gain = maxGain - falloff * distance;
  return Math.max(minGain, gain);
}

/**
 * Calculates gain using quadratic falloff
 */
export function gainFromDistanceQuadratic({
  client,
  source,
  falloff = 0.0001,
  minGain = 0.35,
  maxGain = 1.0,
}) {
  const distance = calculateEuclideanDistance(client, source);
  const gain = maxGain - falloff * distance * distance;
  return Math.max(minGain, gain);
}

/**
 * Exports quadratic falloff as default gain model
 */
export const calculateGainFromDistanceToSource = (params) => {
  return gainFromDistanceQuadratic(params);
};
