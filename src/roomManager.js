import { GRID } from '../types/basic.js'
import { SCHEDULE_TIME_MS } from '../utils/config.js';
import { deleteFolder } from '../utils/deleteFolderCloudinary.js'
import { epochNow } from './kartik.js';
import {calculateGainFromDistanceToSource, gainFromInverseSquare, getSpatialConfig } from './spatial.js'
import { positionClientsInCircle } from '../utils/spatial.js'


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

  let loopCount = 0;
  let lastSourcePos = null;
  let lastUpdateTime = null;

  const config = {
    speed: room.speed ?? 0.7,
    radius: room.radius ?? 25,
    origin: room.origin ?? { x: GRID.ORIGIN_X, y: GRID.ORIGIN_Y },
    falloff: room.falloff ?? 0.01,
    minGain: room.minGain ?? 0.2,
    maxGain: room.maxGain ?? 1.0,
    maxHearingDistance: room.maxHearingDistance ?? 100,
    speedOfSound: 343, // m/s for Doppler
  };

  const intervalFn = () => {
    const clients = Array.from(room.clients.values());
    if (clients.length === 0) return;

    const angle = (loopCount * config.speed * Math.PI) / 30;
    const newX = config.origin.x + config.radius * Math.cos(angle);
    const newY = config.origin.y + config.radius * Math.sin(angle);
    const sourcePos = { x: newX, y: newY };

    // Compute velocity
    const currentTime = Date.now();
    let velocity = { x: 0, y: 0 };
    if (lastSourcePos && lastUpdateTime) {
      const dt = (currentTime - lastUpdateTime) / 1000;
      if (dt > 0) {
        velocity = {
          x: (sourcePos.x - lastSourcePos.x) / dt,
          y: (sourcePos.y - lastSourcePos.y) / dt,
        };
      }
    }
    lastSourcePos = sourcePos;
    lastUpdateTime = currentTime;

    room.listeningSource = sourcePos;

    const gains = Object.fromEntries(
      clients.map((client) => {
        const dx = client.position.x - sourcePos.x;
        const dy = client.position.y - sourcePos.y;
        const dist = Math.hypot(dx, dy);
        const dir = dist === 0 ? { x: 0, y: 0 } : { x: dx / dist, y: dy / dist };
        const vr = velocity.x * dir.x + velocity.y * dir.y;

        const pitch = Math.max(0.5, Math.min(2.0, config.speedOfSound / (config.speedOfSound - vr)));

        const spatial = getSpatialConfig({
          clientPos: client.position,
          sourcePos,
          config,
          angle,
        });

        return [
          client.clientId,
          {
            gain: spatial.gain,
            pan: spatial.pan,
            pitch: pitch,
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

    loopCount++;
  };

  room.intervalId = setInterval(intervalFn, 50);
};

startSpiral = (roomId) => {
  const room = this.rooms.get(roomId);
  if (!room) return;

  const config = {
    minRadius: 0,
    maxRadius: 25,
    angularSpeed: 2 * Math.PI / 8000,
    falloff: 0.01,
    minGain: 0.2,
    maxGain: 1.0,
    maxHearingDistance: 50,
    origin: room.origin ?? { x: GRID.ORIGIN_X, y: GRID.ORIGIN_Y },
    speedOfSound: 343,
  };

  const startTime = Date.now();
  const phaseOffset = Math.random() * 2 * Math.PI;

  let lastSourcePos = null;
  let lastUpdateTime = null;

  const intervalFn = () => {
    const clients = Array.from(room.clients.values());
    if (clients.length === 0) return;

    const currentTime = Date.now();
    const elapsed = currentTime - startTime;
    const t = (elapsed * config.angularSpeed + phaseOffset) % (2 * Math.PI);

    const radius = config.maxRadius;
    const x = config.origin.x + radius * Math.sin(t);
    const y = config.origin.y + radius * Math.sin(t) * Math.cos(t);
    const sourcePos = { x, y };

    // Velocity
    let velocity = { x: 0, y: 0 };
    if (lastSourcePos && lastUpdateTime) {
      const dt = (currentTime - lastUpdateTime) / 1000;
      if (dt > 0) {
        velocity = {
          x: (sourcePos.x - lastSourcePos.x) / dt,
          y: (sourcePos.y - lastSourcePos.y) / dt,
        };
      }
    }
    lastSourcePos = sourcePos;
    lastUpdateTime = currentTime;

    room.listeningSource = sourcePos;

    const gains = Object.fromEntries(
      clients.map((client) => {
        const dx = client.position.x - sourcePos.x;
        const dy = client.position.y - sourcePos.y;
        const dist = Math.hypot(dx, dy);
        const dir = dist === 0 ? { x: 0, y: 0 } : { x: dx / dist, y: dy / dist };
        const vr = velocity.x * dir.x + velocity.y * dir.y;

        const pitch = Math.max(0.5, Math.min(2.0, config.speedOfSound / (config.speedOfSound - vr)));

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
            pitch: pitch,
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

  room.intervalId = setInterval(intervalFn, 50); // ~20 FPS
};


  stopInterval = (roomId) => {
    const room = this.rooms.get(roomId);
    if (!room) return;
    clearInterval(room.intervalId);
    room.intervalId = undefined;
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
