const WebSocket = require("ws");
const MessagePack = require("messagepack");

const Utils = {
  encodeFloat: function (e) {
    return 5 * parseFloat(parseFloat(e).toFixed(1));
  },
  decodeFloat: function (e) {
    return e / 5;
  },
};

class Player {
  constructor(id, ws, gameServer) {
    this.id = id;
    this.ws = ws;
    this.gameServer = gameServer;

    this.playerName = "";
    this.character = "";
    this.weapon = "";
    this.isAuthenticated = false;

    this.health = 100;

    this.position = {
      x: 0,
      y: 0,
      z: 0,
    };

    this.rotation = {
      a: 0,
      b: 0,
    };

    this.fState = false; // Shooting state

    this.lastRespawnTime = Date.now() - 6000;

    this.messageHandlers = {
      auth: "authenticate",
      p: "handlePositionUpdate",
      s: "handleStateUpdate",
      da: "handleDamageUpdate",
      respawn: "sendRespawnInfo",
      chat: "handleChatMessage"
    };

    this.ws.on("message", (raw) => {
      try {
        const data = MessagePack.decode(raw);
        if (data[0] in this.messageHandlers) this[this.messageHandlers[data[0]]](data)
      } catch (_) {}
    });

    this.ws.on("close", () => {
      this.gameServer.removePlayer(this.id);
    });
  }

  sendData(...data) {
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
    this.sendLobbyPlayersInfo();
    this.gameServer.broadcastPlayerDetails(this.id);
    this.gameServer.broadcastBoard();
  }

  takeDamage(amount) {
    this.health -= amount;
    this.gameServer.broadcast("h", this.id, this.health);
  }

  handlePositionUpdate(data) {
    const cachePosition = Object.assign({}, this.position);
    const cacheRotation = Object.assign({}, this.rotation);
    this.position.x = Utils.decodeFloat(data[1]);
    this.position.y = Utils.decodeFloat(data[2]);
    this.position.z = Utils.decodeFloat(data[3]);
    this.rotation.a = Utils.decodeFloat(data[4]);
    this.rotation.b = Utils.decodeFloat(data[5]);
    if (this.position != cachePosition || this.rotation != cacheRotation) {
      this.gameServer.broadcast(
        "p",
        this.id,
        Utils.encodeFloat(this.position.x),
        Utils.encodeFloat(this.position.y),
        Utils.encodeFloat(this.position.z),
        Utils.encodeFloat(this.rotation.a),
        Utils.encodeFloat(this.rotation.b),
      );
    }
  }

  handleStateUpdate(data) {
    if (data[1] == "f") {
      this.fState = data[2];
      this.gameServer.broadcastExcept(this.id, "s", this.id, "f", this.fState);
    }
  }

  handleDamageUpdate(data) {
    const targetPlayer = this.gameServer.getPlayerByID(data[1]);
    if (targetPlayer) {
      targetPlayer.takeDamage(data[2]);
    }
  }

  handleChatMessage(data) {
    this.gameServer.broadcastExcept(this.id, "chat", this.id, data[1]);
  }

  sendRespawnInfo() {
    if (Date.now() >= this.lastRespawnTime + 5000) {
      this.gameServer.broadcast(
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
      );
      this.lastRespawnTime = Date.now();
    }
  }

  // 'Me' means the details of the player's self
  sendMe() {
    this.sendData(
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
    );
  }

  sendMode() {
    this.sendData(
      "mode",
      this.gameServer.gameMode,
      this.gameServer.map,
      false,
    );
  }

  sendPlayerInfo(id) {
    for (var i = 0; i < this.gameServer.players.length; i++) {
      if (this.gameServer.players[i].id == id) {
        const player = this.gameServer.players[i];
        this.sendData(
          "player",
          {
            dance: "Techno",
            group: 1,
            herokSkin: false,
            playerId: player.id,
            skin: player.character,
            team: "none",
            username: player.playerName,
            weapon: player.weapon,
          },
        );
      }
    }
  }

  sendLobbyPlayersInfo() {
    for (var i = 0; i < this.gameServer.players.length; i++) {
      if (this.gameServer.players[i].id == this.id) {
        return;
      }
      this.sendPlayerInfo(this.gameServer.players[i].id);
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
    newPlayer.sendData("auth", true);
  }

  removePlayer(id) {
    for (var i = 0; i < this.players.length; i++) {
      if (this.players[i].id == id) {
        this.players.splice(i, 1);
      }
    }
  }

  getPlayerByID(id) {
    for (var i = 0; i < this.players.length; i++) {
      if (this.players[i].id == id) {
        return this.players[i];
      }
    }
  }

  constructBoard() {
    const data = [];
    for (var i = 0; i < this.players.length; i++) {
      data.push({
        bar: 0.0,
        kill: 0,
        death: 0,
        score: 0,
        tier: 1,
        playerId: this.players[i].id,
        username: this.players[i].playerName,
        skin: this.players[i].character,
        verified: false,
      });
    }
    return data;
  }

  broadcast(...data) {
    for (var i = 0; i < this.players.length; i++) {
      this.players[i].sendData(...data);
    }
  }

  broadcastExcept(id, ...data) {
    for (var i = 0; i < this.players.length; i++) {
      if (this.players.id != id) {
        this.players[i].sendData(...data);
      }
    }
  }

  broadcastPlayerDetails(id) {
    for (var i = 0; i < this.players.length; i++) {
      this.players[i].sendPlayerInfo(id);
    }
  }

  broadcastBoard() {
    this.broadcast("board", this.constructBoard());
  }
}

module.exports = {
  GameServer,
  Player,
};
