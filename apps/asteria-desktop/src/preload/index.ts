import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("asteria", {
  ping: () => "pong",
});
