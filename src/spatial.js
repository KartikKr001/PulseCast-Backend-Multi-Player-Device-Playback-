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
  falloff = 0.02,
  minGain = 0.05,
  maxGain = 1.0,
}) {
  const distance = calculateEuclideanDistance(client, source);
  const gain = maxGain - falloff * distance * distance;
  return Math.max(minGain, gain);
}

/**
 * Calculates gain using inverse falloff
 */
export function gainFromInverseSquare({
  client,
  source,
  falloff = 0.001,      // Controls how fast gain decreases with distance
  minGain = 0.2,         // Ensure sound never fully disappears
  maxGain = 1.0          // Max loudness at the source
}){
  const dx = client.x - source.x;
  const dy = client.y - source.y;
  const distanceSq = dx * dx + dy * dy;

  // Inverse square falloff model
  const gain = maxGain / (1 + falloff * distanceSq);

  return Math.max(minGain, gain);
}


export function getSpatialConfig({ clientPos, sourcePos, config,angle }) {
  const dx = clientPos.x - sourcePos.x;
  const dy = clientPos.y - sourcePos.y;
  const distanceSq = dx * dx + dy * dy;
  const distance = Math.sqrt(distanceSq);

  const gain = Math.max(
    0.15,
    1 - 0.0005*distanceSq
  );
  const pitch = 1; // Adjust factor to taste

  return { gain };
}

export const calculateGainFromDistanceToSource = (params) => {
  return getSpatialConfig(params);
};
