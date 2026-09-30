const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("absDesktop", {
  isDesktop: true,
  setPendingBookings: (count) => ipcRenderer.send("abs-pending-bookings", count),
  reload: () => ipcRenderer.send("abs-reload"),
  updateDesk: () => ipcRenderer.invoke("abs-update-desk"),
});
