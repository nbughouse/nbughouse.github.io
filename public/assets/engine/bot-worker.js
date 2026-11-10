/* Host-owned adapter; the vendored Fairy-Stockfish files are unmodified. */
importScripts("fairy-stockfish/stockfish.js");
let engine;
self.onmessage = event => {
    if (typeof event.data === "string" && engine) engine.postMessage(event.data);
};
Stockfish({
    locateFile: file => new URL(`fairy-stockfish/${file}`, self.location.href).href,
    mainScriptUrlOrBlob: new URL("fairy-stockfish/stockfish.js", self.location.href).href,
}).then(instance => {
    engine = instance;
    engine.addMessageListener(line => self.postMessage({ line }));
    self.postMessage({ ready: true });
}).catch(error => self.postMessage({ error: String(error) }));
