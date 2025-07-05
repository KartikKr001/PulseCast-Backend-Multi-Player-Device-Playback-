export default function handleUploadComplete(io) {
  return async function (req, res) {
    console.log("request came: ",req.body);
    try {
      const { roomId, originalName, publicUrl } = req.body;
      console.log("roomId: ", roomId);
      console.log("originalName: ", originalName);
      console.log("publicURL: ", publicUrl);
      console.log(`✅ Audio upload completed - broadcasting to room ${roomId}: (${publicUrl})`);

      io.to(roomId).emit('message', {
          type : "ROOM_EVENT",
          event: {
            type: 'NEW_AUDIO_SOURCE',
            id: publicUrl,
            title: originalName,
            duration: 1, // TODO: calculate this properly later
            addedAt: Date.now(),
            addedBy: roomId,
          }
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: 'Error uploading file',
        error: error.message,
      });
    }
  };
}
