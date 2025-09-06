import { GRID } from '../types/basic.js'
import { SCHEDULE_TIME_MS } from '../utils/config.js';
import { deleteFolder } from '../utils/deleteFolderCloudinary.js'
import { epochNow } from './kartik.js';
import {calculateGainFromDistanceToSource, gainFromInverseSquare, getSpatialConfig } from './spatial.js'
import { positionClientsInCircle } from '../utils/spatial.js'

const BASE_CONFIG = {
  falloff: 0.001,
  minGain: 0.05,
  maxGain: 1.0,
  maxHearingDistance: 100,
  radius: 25,
  speed: 0.1,
  origin: { x: GRID.ORIGIN_X, y: GRID.ORIGIN_Y },
};

const TICK_MS = 33; // ~30 FPS

export class RoomManager {
  rooms = new Map();  // Map of room id to Room object

  constructor(io) {
    this.io = io;
  }

  addClient = (socket) => {
  const { roomId, username, clientId } = socket.data;
    if(!roomId || !username || !clientId){
      console.warn("Missing connection params:", { roomId, username, clientId });
      socket.disconnect(true);
      return;
    }
    console.log(`🧩 Adding client [${username}] to room: ${roomId}`);

    // Ensure room exists
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        clients: new Map(),
        roomId,
        listeningSource: { x: GRID.ORIGIN_X, y: GRID.ORIGIN_Y },
      });
    }
    const room = this.rooms.get(roomId);

    // Create client data and attach socket as non-enumerable
    const clientData = {
      username,
      clientId,
      rtt: 0,
      position: { x: GRID.ORIGIN_X, y: GRID.ORIGIN_Y - 25 },
    };

    Object.defineProperty(clientData, "socket", {
      value: socket,
      enumerable: false, 
      writable: false,
      configurable: false,
    });

    // Save client
    room.clients.set(clientId, clientData);

    // Join room
    socket.join(roomId);

    // Recalculate positions
    positionClientsInCircle(room.clients);

    console.log(`✅ Client ${username} added to room ${roomId}`);
    console.log("Current clients:", [...room.clients.keys()]);
};

  removeClient = async (roomId, clientId) => {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.clients.delete(clientId);

    if (room.clients.size === 0) {
      this.stopInterval(roomId);
      await this.cleanupRoom(roomId);

      const currentRoom = this.rooms.get(roomId);
      if (currentRoom && currentRoom.clients.size === 0) {
        this.rooms.delete(roomId);
        console.log(`Room ${roomId} deleted from memory`);
      } else if (currentRoom && currentRoom.clients.size > 0) {
        console.log(`Room ${roomId} has new clients - skipping deletion`);
        positionClientsInCircle(currentRoom.clients);
      }
      return;
    }

    positionClientsInCircle(room.clients);
  };

  cleanupRoom = async (roomId) => {
    console.log(`🧹 Cleaning up room ${roomId}...`);
    try {
      const result = await deleteFolder()
    } catch (err) {
      console.error(`❌ Cleanup failed for room ${roomId}:`, err);
    }
  };

  getRoomState = (roomId) => this.rooms.get(roomId);

  getClients = (roomId) => {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.clients.values()) : [];
  };

  reorderClients = ({ roomId, clientId }) => {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    const clients = Array.from(room.clients.values());
    const index = clients.findIndex((c) => c.clientId === clientId);
    if (index === -1) return clients;

    const [client] = clients.splice(index, 1);
    clients.unshift(client);

    room.clients.clear();
    clients.forEach((c) => room.clients.set(c.clientId, c));

    positionClientsInCircle(room.clients);
    this._broadcastSpatialConfig(room);

    return clients;
  };

  updateClientRTT = (roomId, clientId, rtt) => {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const client = room.clients.get(clientId);
    if (client) {
      client.rtt = rtt;
      room.clients.set(clientId, client);
    }
  };


startInterval = (roomId) => {
  const room = this.rooms.get(roomId);
  if (!room) return;

  const config = {
    ...BASE_CONFIG,
    ...room, // overrides with per-room config if set
  };

  const startTime = Date.now();
  let loops = 0;
  const intervalFn = () => {
    const clients = Array.from(room.clients.values());
    if (clients.length === 0) return;

    const angle = (loops * Math.PI) / 30;
    const newX = config.origin.x + 25 * Math.cos(angle);
    const newY = config.origin.y + 25 * Math.sin(angle);
    const newSource = { x: newX, y: newY };

    room.listeningSource = newSource;

    const gains = Object.fromEntries(
      clients.map((client) => {
        const spatial = getSpatialConfig({
          clientPos: client.position,
          sourcePos: newSource,
          config,
          angle,
        });

        return [
          client.clientId,
          {
            gain: spatial.gain,
            rampTime: 0.5,
          },
        ];
      })
    );

    this.io.to(roomId).emit("message", {
      type: "SCHEDULED_ACTION",
      serverTimeToExecute: epochNow() + SCHEDULE_TIME_MS,
      scheduledAction: {
        type: "SPATIAL_CONFIG",
        listeningSource: newSource,
        gains,
      },
    });
    loops++;
  };

  room.intervalId = setInterval(intervalFn, 50);
};

startSpiral = (roomId) => {
  const room = this.rooms.get(roomId);
  if (!room) return;

  const config = {
    ...BASE_CONFIG,
    ...room,
    angularSpeed: (2 * Math.PI) / 4000, // full rotation every 4s
  };

  const startTime = Date.now();
  const phaseOffset = Math.random() * 2 * Math.PI;

  const intervalFn = () => {
    const clients = Array.from(room.clients.values());
    if (clients.length === 0) return;

    const elapsed = Date.now() - startTime;
    const t = (elapsed * config.angularSpeed + phaseOffset) % (2 * Math.PI);

    // Figure-eight path
    const radius = 25;
    const x = config.origin.x + radius * Math.sin(t);
    const y = config.origin.y + radius * Math.sin(t) * Math.cos(t);
    const sourcePos = { x, y };

    room.listeningSource = sourcePos;

    const gains = Object.fromEntries(
      clients.map((client) => {
        const spatial = getSpatialConfig({
          clientPos: client.position,
          sourcePos,
          angle: t,
          config,
        });

        return [
          client.clientId,
          {
            gain: spatial.gain,
            pan: spatial.pan,
            pitch: spatial.pitch,
            rampTime: 0.25,
          },
        ];
      })
    );

    this.io.to(roomId).emit("message", {
      type: "SCHEDULED_ACTION",
      serverTimeToExecute: epochNow() + SCHEDULE_TIME_MS,
      scheduledAction: {
        type: "SPATIAL_CONFIG",
        listeningSource: sourcePos,
        gains,
      },
    });
  };

  room.intervalId = setInterval(intervalFn, TICK_MS);
};

stopInterval = (roomId) => {
  const room = this.rooms.get(roomId);
  if (!room) return;

  clearInterval(room.intervalId);
  room.intervalId = undefined;

  // Reset audio state for clients
  const clients = Array.from(room.clients.values());
  if (clients.length > 0) {
    const neutralGains = Object.fromEntries(
      clients.map((client) => [
        client.clientId,
        { gain: 0, pan: 0, rampTime: 0.25 },
      ])
    );

    this.io.to(roomId).emit("message", {
      type: "SCHEDULED_ACTION",
      serverTimeToExecute: epochNow() + SCHEDULE_TIME_MS,
      scheduledAction: {
        type: "SPATIAL_CONFIG",
        listeningSource: null,
        gains: neutralGains,
      },
    });
  }

  room.listeningSource = null;
};

  _broadcastSpatialConfig = (room) => {
    const clients = Array.from(room.clients.values());
    const gains = Object.fromEntries(
      clients.map((client) => [
        client.clientId,
        {
          gain: calculateGainFromDistanceToSource({
            client: client.position,
            source: room.listeningSource,
          }),
          rampTime: 0.25,
        },
      ])
    );

    this.io.to(room.roomId).emit("message", {
      type: "SCHEDULED_ACTION",
      serverTimeToExecute: epochNow(),
      scheduledAction: {
        type: "SPATIAL_CONFIG",
        listeningSource: room.listeningSource,
        gains,
      },
    });
  };

  updateListeningSource = ({ roomId, position }) => {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.listeningSource = position;
    this._broadcastSpatialConfig(room);
  };

  moveClient = ({ roomId, clientId, position }) => {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const client = room.clients.get(clientId);
    if (!client) return;

    client.position = position;
    room.clients.set(clientId, client);

    this._broadcastSpatialConfig(room);
  };
}
