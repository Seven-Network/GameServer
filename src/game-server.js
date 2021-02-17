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
    this.isAlive = true;

    this.kills = 0;
    this.deaths = 0;
    this.headshots = 0;
    this.score = 0;

    this.streak = 1;
    this.streakTimeout = null;
    this.getStreakScore = (streak) => {
      return [10, 15, 30, 35, 70, 125, 135, 155, 215, 265][
        Math.min(streak, 10) - 1
      ];
    };
    this.getStreakNotif = (streak, headshot) => {
      if (streak == 1) {
        return headshot ? "Headshot" : "Kill";
      } else {
        let s = Math.min(streak, 10);
        return s + "x";
      }
    };

    this.position = {
      x: 0,
      y: 0,
      z: 0,
    };

    this.rotation = {
      a: 0,
      b: 0,
    };

    this.states = {};

    this.lastRespawnTime = Date.now() - 6000;

    this.messageHandlers = {
      auth: "authenticate",
      p: "handlePositionUpdate",
      s: "handleStateUpdate",
      e: "handleEventUpdate",
      da: "handleDamageUpdate",
      weapon: "handleWeaponUpdate",
      respawn: "sendRespawnInfo",
      chat: "handleChatMessage",
      ping: "handlePingMessage",
    };

    this.ws.on("message", (raw) => {
      try {
        const data = MessagePack.decode(raw);
        if (data[0] in this.messageHandlers)
          this[this.messageHandlers[data[0]]](data);
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
    this.sendData("ping", true);
  }

  takeDamage(amount, damagerID, headshot) {
    if (!this.isAlive) return;
    this.health -= headshot ? amount * 2 : amount;
    this.sendData("da", damagerID);
    this.gameServer.broadcast("h", this.id, this.health);
    if (this.health <= 0) {
      this.die(damagerID, amount, headshot);
    }
  }

  die(killerID, damage, headshot) {
    this.gameServer.broadcast("d", this.id);
    this.gameServer.broadcast("k", this.id, killerID);

    const score = this.getStreakScore(this.streak);
    const notif = this.getStreakNotif(this.streak, headshot);

    this.gameServer.broadcast("notification", "kill", {
      killer: killerID,
      killed: this.id,
      reason: false,
    });
    this.gameServer.broadcast("announce", "kill", killerID, score, notif);

    this.isAlive = false;
    this.deaths += 1;

    const killer = this.gameServer.getPlayerByID(killerID);
    if (killer) {
      killer.kills += 1;
      killer.headshots += headshot ? 1 : 0;
      killer.score += score;
    }

    if (this.streakTimeout) clearTimeout(this.streakTimeout);
    this.streak += 1;
    this.streakTimeout = setTimeout(() => {
      this.streak = 1;
    }, 10000);

    this.gameServer.broadcastBoard();

    // Respawn
    setTimeout(() => {
      this.isAlive = true;
      this.health = 100;
      this.gameServer.broadcast("h", this.id, this.health);
      this.sendRespawnInfo();
    }, 4000);
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
        Utils.encodeFloat(this.rotation.b)
      );
    }
  }

  handleStateUpdate(data) {
    try {
      this.states[data[1]] = data[2];
      this.gameServer.broadcastExcept(this.id, "s", this.id, data[1], data[2]);
    } catch (_) {}
  }

  handleEventUpdate(data) {
    this.gameServer.broadcastExcept(this.id, "e", this.id, data[1]);
  }

  handleDamageUpdate(data) {
    if (!this.isAlive) return;
    const targetPlayer = this.gameServer.getPlayerByID(data[1]);
    if (targetPlayer) {
      targetPlayer.takeDamage(data[2], this.id, data[3]);
    }
  }

  handleWeaponUpdate(data) {
    this.weapon = data[1];
    this.gameServer.broadcastExcept(this.id, "weapon", this.id, this.weapon);
  }

  handleChatMessage(data) {
    this.gameServer.broadcast("chat", this.id, data[1]);
  }

  handlePingMessage(data) {
    this.sendData("ping", true);
  }

  sendRespawnInfo() {
    if (Date.now() >= this.lastRespawnTime + 5000) {
      this.gameServer.broadcast("respawn", this.id, {
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
      });
      this.lastRespawnTime = Date.now();
    }
  }

  // 'Me' means the details of the player's self
  sendMe() {
    this.sendData("me", {
      dance: "Techno",
      group: this.id,
      heroSkin: false,
      playerId: this.id,
      skin: this.character,
      team: "none",
      username: this.playerName,
      weapon: this.weapon,
      weaponSkins: {
        Scar: false,
        Shotgun: false,
        Sniper: false,
        "Tec-9": false,
      },
    });
  }

  sendMode() {
    this.sendData("mode", this.gameServer.gameMode, this.gameServer.map, false);
  }

  sendPlayerInfo(id) {
    for (var i = 0; i < this.gameServer.players.length; i++) {
      if (this.gameServer.players[i].id == id) {
        const player = this.gameServer.players[i];
        this.sendData("player", {
          dance: "Techno",
          group: player.id,
          heroSkin: false,
          playerId: player.id,
          skin: player.character,
          team: "none",
          username: player.playerName,
          weapon: player.weapon,
        });
      }
    }
  }

  sendLobbyPlayersInfo() {
    // Not sure why but in game, there is player with ID -1
    this.sendData("player", {
      dance: false,
      group: -1,
      skin: "none",
      playerId: "-1",
      team: -1,
      username: "",
      weapon: false,
    });
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

    this.timer = 20;

    this.idleTime = 0;
    this.lastIdleCheck = Date.now();
    this.isIdleChecking = false;

    this.shouldTick = true;

    this.timerInterval = null;

    this.wss.on("connection", (ws) => {
      this.addPlayer(ws);
    });

    setImmediate(() => {
      this.update();
    });
  }

  update() {
    if (!this.shouldTick) return;

    // Check for server inactivity
    if (this.players.length == 0) {
      if (!this.isIdleChecking) {
        this.lastIdleCheck = Date.now();
        this.isIdleChecking = true;
      }
      this.idleTime += Date.now() - this.lastIdleCheck;
      this.lastIdleCheck = Date.now();
      if (this.idleTime >= 60000) {
        global.destroyGameServer(this.roomID);
      }
    } else {
      this.idleTime = 0;
      this.isIdleChecking = false;
    }

    setImmediate(() => {
      this.update();
    });
  }

  addPlayer(ws) {
    this.lastAssignedID += 1;
    const newPlayer = new Player(this.lastAssignedID, ws, this);
    this.players.push(newPlayer);
    newPlayer.sendData("auth", true);
    if (!this.timerInterval) {
      // Set timer when first player joins
      this.timerInterval = setInterval(() => {
        if (this.timer < 1) return;
        this.timer -= 1;
        if (this.timer == 0) {
          this.endGame();
        }
        this.broadcast("t", this.timer);
      }, 1000);
    }
  }

  removePlayer(id) {
    for (var i = 0; i < this.players.length; i++) {
      if (this.players[i].id == id) {
        this.broadcastExcept(id, "left", this.players[i].id);
        this.players.splice(i, 1);
        this.broadcastBoard();
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

  endGame() {
    const resultBoard = [];
    for (var i = 0; i < this.players.length; i++) {
      resultBoard.push({
        id: this.players[i].id,
        username: this.players[i].playerName,
        team: "none",
        won: 0,
        kill: this.players[i].kills,
        death: this.players[i].deaths,
        headshot: this.players[i].headshots,
        score: this.players[i].score,
        skin: this.players[i].character,
        tier: 1,
      });
    }
    resultBoard.sort((a, b) => {
      if (a.score > b.score) {
        return -1;
      } else if (a.score == b.score) {
        return 0;
      } else {
        return 1;
      }
    });
    resultBoard[0].won = 1;
    this.broadcast("finish", resultBoard);
  }

  constructBoard() {
    const data = [];
    for (var i = 0; i < this.players.length; i++) {
      data.push({
        bar: 0.0,
        kill: this.players[i].kills,
        death: this.players[i].deaths,
        score: this.players[i].score,
        tier: 1,
        playerId: this.players[i].id,
        username: this.players[i].playerName,
        skin: this.players[i].character,
        verified: false,
      });
    }
    data.sort((a, b) => {
      if (a.score > b.score) {
        return -1;
      } else if (a.score == b.score) {
        return 0;
      } else {
        return 1;
      }
    });
    return data;
  }

  broadcast(...data) {
    for (var i = 0; i < this.players.length; i++) {
      this.players[i].sendData(...data);
    }
  }

  broadcastExcept(id, ...data) {
    for (var i = 0; i < this.players.length; i++) {
      if (this.players[i].id != id) {
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
