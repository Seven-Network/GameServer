const WebSocket = require("ws");
const MessagePack = require("messagepack");

class Player {
  constructor(id, ws, gameServer) {
    this.id = id;
    this.ws = ws;
    this.gameServer = gameServer;

    this.playerName = "";
    this.character = "";
    this.weapon = "";
    this.isAuthenticated = false;

    this.lastRespawnTime = Date.now() - 6000;

    this.messageHandlers = {
      auth: (data) => {
        this.authenticate(data);
      },

      respawn: (_) => {
        this.sendRespawnInfo();
      },

      chat: (data) => {
        this.handleChatMessage();
      },
    };

    this.ws.on("message", (raw) => {
      try {
        const data = MessagePack.decode(raw);
        for (let [key, value] of Object.entries(this.messageHandlers)) {
          if (data[0] == key) {
            value(data);
          }
        }
      } catch (_) {}
    });

    this.ws.on("close", () => {
      this.gameServer.removePlayer(this.id);
    });
  }

  sendData(data) {
    const encodedData = MessagePack.encode(data);
    this.ws.send(encodedData);
  }

  authenticate(data) {
    if (data[2] != "none") {
      this.playerName = data[2];
    } else {
      this.playerName = `Guest ${this.id}`;
    }
    this.character = data[3];
    this.weapon = data[4];
    this.isAuthenticated = true;

    console.log(`${this.playerName} connected to ${this.gameServer.roomID}`);

    this.sendMe();
    this.sendMode();
  }

  handleChatMessage(data) {
    this.gameServer.broadcast(["chat", this.id, data[1]]);
  }

  // 'Me' means the details of the player's self
  sendMe() {
    this.sendData([
      "me",
      {
        dance: "Techno",
        group: 1,
        heroSkin: false,
        playerId: this.id,
        skin: this.character,
        team: "none",
        username: this.username,
        weapon: this.weapon,
        weaponSkins: {
          Scar: false,
          Shotgun: false,
          Sniper: false,
          "Tec-9": false,
        },
      },
    ]);
  }

  sendMode() {
    this.sendData([
      "mode",
      this.gameServer.gameMode,
      this.gameServer.map,
      false,
    ]);
  }

  sendRespawnInfo() {
    if (Date.now() >= this.lastRespawnTime + 5000) {
      this.sendData([
        "respawn",
        this.id,
        {
          position: {
            x: 0,
            y: 10,
            z: 0,
          },
          rotation: {
            x: 0,
            y: 0,
            z: 0,
          },
        },
      ]);
      this.lastRespawnTime = Date.now();
    }
  }
}

class GameServer {
  constructor(roomID) {
    this.wss = new WebSocket.Server({ noServer: true });

    this.roomID = roomID;
    this.players = [];

    this.map = "Sierra";
    this.gameMode = "POINT";

    this.lastAssignedID = 0;

    this.wss.on("connection", (ws) => {
      this.addPlayer(ws);
    });
  }

  addPlayer(ws) {
    this.lastAssignedID += 1;
    const newPlayer = new Player(this.lastAssignedID, ws, this);
    this.players.push(newPlayer);
    newPlayer.sendData(["auth", true]);
  }

  removePlayer(id) {
    for (var i = 0; i < this.players.length; i++) {
      if (this.players[i].id == id) {
        this.players.splice(i, 1);
      }
    }
  }

  broadcast(data) {
    for (var i = 0; i < this.players.length; i++) {
      this.players[i].sendData(data);
    }
  }
}

module.exports = {
  GameServer,
  Player,
};
