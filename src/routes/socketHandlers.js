import { SCHEDULE_TIME_MS } from "../../utils/config.js";
import { epochNow } from "../kartik.js";
import { roomManager } from "../index.js";
const createClientUpdate = (roomId, roomManager) => ({
  type: "ROOM_EVENT",
  event: {
    type: "CLIENT_CHANGE",
    clients: roomManager.getClients(roomId),
  },
});

export function handleOpen(socket, io, roomManager) {
  const { roomId, clientId, username } = socket.data;
  socket.emit("message", {
    type: "SET_CLIENT_ID",
    clientId,
  });
  roomManager.addClient(socket);
  io.to(roomId).emit("message", createClientUpdate(roomId, roomManager));
}

export const handleClientMessage = async (socket, rawMessage, io, roomManager) => {
  // console.log("indide message handler")
  const { roomId, username, clientId } = socket.data;
  const t1 = epochNow();
  try {
    const parsedData = typeof rawMessage === "string"
      ? JSON.parse(rawMessage)
      : rawMessage;

    if(parsedData.type === "NTP_REQUEST"){
      socket.emit("message", {
        type:"NTP_RESPONSE",
        t0: parsedData.t0,
        t1,
        t2: epochNow(),
      })
      return;
    }
    else if(parsedData.type === "PLAY" || parsedData.type === "PAUSE"){
        io.to(roomId).emit("message", {
          type: "SCHEDULED_ACTION",
          scheduledAction: parsedData,
          serverTimeToExecute: epochNow() + SCHEDULE_TIME_MS,
        });
      }
      else if(parsedData.type === "START_SPATIAL_AUDIO"){
        const room = roomManager.getRoomState(roomId);
        roomManager.stopInterval(roomId);
        if (!room || room.intervalId) return;
        const temp = await roomManager.startInterval(roomId);
        return;
      } 
      else if(parsedData.type === "START_SPIRAL_SPATIAL_AUDIO"){
        const room = roomManager.getRoomState(roomId);
        roomManager.stopInterval(roomId);
        // console.log(room);
        if (!room || room.intervalId) return;
        const temp = await roomManager.startSpiral(roomId);
        // console.log("response sent",temp);
        return;
      }
      else if(parsedData.type === "STOP_SPATIAL_AUDIO"){
        const room = roomManager.getRoomState(roomId);
        if (!room || !room.intervalId) return;
        roomManager.stopInterval(roomId);
        io.to(roomId).emit("message", {
          type: "SCHEDULED_ACTION",
          scheduledAction: {
            type: "STOP_SPATIAL_AUDIO",
          },
          serverTimeToExecute: epochNow(),
        });

      } 
      else if(parsedData.type === "REUPLOAD_AUDIO"){
        io.to(roomId).emit("message", {
          type: "ROOM_EVENT",
          event: {
            type: "NEW_AUDIO_SOURCE",
            id: parsedData.audioId,
            title: parsedData.audioName,
            duration: 1,
            addedAt: Date.now(),
            addedBy: roomId,
          },
        });
      }
      else if(parsedData.type === "REORDER_CLIENT"){
        const reorderedClients = roomManager.reorderClients({
          roomId,
          clientId: parsedData.clientId,
        });

        io.to(roomId).emit("message", {
          type: "ROOM_EVENT",
          event: {
            type: "CLIENT_CHANGE",
            clients: reorderedClients,
          },
        });
      } 
      else if(parsedData.type === "SET_LISTENING_SOURCE"){
        roomManager.updateListeningSource({
          roomId,
          position: parsedData,
        });
      }
      else if(parsedData.type === "MOVE_CLIENT"){
        roomManager.moveClient({
          roomId,
          clientId,
          position: parsedData,
        });
      }
      else{
        console.warn(`⚠️ Unrecognized message:`, parsedData);
      }
      return;
  } 
  catch (error) {
    console.error("❌ Invalid message format:", error);
    socket.emit("ERROR", { message: "Invalid message format" });
  }
};

export const handleClose = async (socket, io, roomManager) => {
  const { roomId, clientId, username } = socket.data;

  console.log(`❌ Disconnected: ${username} from room ${roomId}`);
  await roomManager.removeClient(roomId, clientId);
  io.to(roomId).emit("message", {
    type: "ROOM_EVENT",
    event: {
      type: "CLIENT_CHANGE",
      clients: roomManager.getClients(roomId),
    }
  });
};
