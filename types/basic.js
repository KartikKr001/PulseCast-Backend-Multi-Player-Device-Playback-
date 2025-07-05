import { z } from "zod";

export const GRID = {
  SIZE: 100,
  ORIGIN_X: 50,
  ORIGIN_Y: 50,
  CLIENT_RADIUS: 25,
};

export const PositionSchema = z.object({
  x: z.number().min(0).max(GRID.SIZE),
  y: z.number().min(0).max(GRID.SIZE),
});
