import { RoomManager } from "./roomManager";
import { io } from './index.js';
export const roomManager = new RoomManager(io);
