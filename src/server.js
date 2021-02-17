require("dotenv").config();

const http = require("http");
const url = require("url");
const express = require("express");
const bodyParser = require("body-parser");

const { GameServer } = require("./game-server");
const serverLinkRouter = require("./router");

const app = express();

app.use(bodyParser.json());
app.use("/", serverLinkRouter);

const server = http.createServer(app);

const gameServers = {};

function createGameServer(id) {
  if (id in gameServers)
    throw new Error("Game server with that ID already exists");
  const newGameServer = new GameServer(id);
  gameServers[id] = newGameServer;
  console.log(`Created game ${newGameServer.roomID}`);
  return newGameServer;
}

function getGameServer(id) {
  return id in gameServers ? gameServers[id] : null;
}

function destroyGameServer(id) {
  if (id in gameServers) {
    console.log(`Destroyed game ${gameServers[id].roomID}`);
    gameServers[id].shouldTick = false;
    gameServers[id] = null;
  }
}

server.on("upgrade", function upgrade(request, socket, head) {
  const pathname = request.url,
    roomID = pathname.split("?").pop();

  if (roomID in gameServers) {
    gameServers[roomID].wss.handleUpgrade(
      request,
      socket,
      head,
      function done(ws) {
        gameServers[roomID].wss.emit("connection", ws, request);
      }
    );
    return;
  }

  socket.destroy();
});

server.listen(process.env.PORT || 7779, () => {
  console.log(`Running on port ${process.env.PORT || 7779}`);
});

global.createGameServer = createGameServer;
global.getGameServer = getGameServer;
global.destroyGameServer = destroyGameServer;
