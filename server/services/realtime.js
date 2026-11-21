let ioInstance = null;

export function setSocketServer(io) {
  ioInstance = io;
}

export function emitRealtimeEvent(event, payload) {
  if (ioInstance) {
    ioInstance.emit(event, payload);
  }
}
