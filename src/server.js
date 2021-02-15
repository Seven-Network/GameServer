require("dotenv").config();

const http = require("http");
const url = require("url");
const express = require("express");
const bodyParser = require("body-parser");

const { GameServer } = require("./game-server");
const serverLinkRouter = require("./server-link.router");

const app = express();

app.use(bodyParser.json());
app.use("/", serverLinkRouter);

const server = http.createServer(app);

const gameServers = [];

function createGameServer(id) {
  for (var i = 0; i < gameServers.length; i++) {
    if (gameServers[i].roomID == id) {
      throw new Error("Game server with that ID already exists");
    }
  }
  const newGameServer = new GameServer(id);
  gameServers.push(newGameServer);
  return newGameServer;
}

server.on("upgrade", function upgrade(request, socket, head) {
  const pathname = url.parse(request.url).pathname;

  for (var i = 0; i < gameServers.length; i++) {
    if (pathname == `/${gameServers[i].id}`) {
      gameServers[i].wss.handleUpgrade(
        request,
        socket,
        head,
        function done(ws) {
          gameServers[i].wss.emit("connection", ws, request);
        }
      );
      return;
    }
  }

  socket.destroy();
});

server.listen(process.env.PORT || 7779, () => {
  console.log(`Running on port ${process.env.PORT || 7779}`);
});

global.createGameServer = createGameServer;
