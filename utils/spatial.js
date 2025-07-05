import { GRID } from "../types/basic.js";

/**
 * Positions clients in a circle around a center point
 * @param {Map<string, Object>} clients - Map of clients to position
 */
export function positionClientsInCircle(clients) {
  const clientCount = clients.size;

  // Single client: center it
  if (clientCount === 1) {
    const client = clients.values().next().value;
    client.position = {
      x: GRID.ORIGIN_X,
      y: GRID.ORIGIN_Y - 25,
    };
    return;
  }

  // Multiple clients: arrange in circle
  let index = 0;
  clients.forEach((client) => {
    const angle = (index / clientCount) * 2 * Math.PI - Math.PI / 2;
    client.position = {
      x: GRID.ORIGIN_X + GRID.CLIENT_RADIUS * Math.cos(angle),
      y: GRID.ORIGIN_Y + GRID.CLIENT_RADIUS * Math.sin(angle),
    };
    index++;
  });
}