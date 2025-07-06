import express from "express";
import 'dotenv/config'
import http from "http";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import cors from "cors";
import { handleClientMessage, handleClose, handleOpen } from "./routes/socketHandlers.js";
import { RoomManager } from "./roomManager.js"; // import RoomManager
import handleUploadComplete from "./controllors/handleUpload.js";

const app = express();
app.use(cors({
  origin : '*',
  credentials : true
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

export const roomManager = new RoomManager(io); // ✅ create instance

const PORT = process.env.PORT;
io.on("connection", (socket) => {
  const { roomId, username } = socket.handshake.query;
  console.log("user connected",username)
  if (!roomId || !username) {
    console.log("Missing roomId or username on connection");
    socket.disconnect(true);
    return;
  }

  const clientId = nanoid();
  socket.data = { roomId, username, clientId };

  handleOpen(socket, io, roomManager);

  socket.on("message", (message) => {
    console.log("message income",message);
    handleClientMessage(socket, message, io, roomManager);
  });

  socket.on("disconnect", (reason) => {
    handleClose(socket, io, roomManager);
    console.log(`User ${clientId} disconnected (${reason})`);
  });
});

app.get("/", (_, res) =>{
  res.send("Socket.io server running")
});
app.post('/upload-complete',handleUploadComplete(io))

server.listen(PORT, () => {
  console.log(`Server listening..`);
});
