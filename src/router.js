const router = require("express").Router();

router.get("/", (_, res) => {
  res.send("Welcome to the Seven Network invite server ✨");
});

router.post("/get-room/:roomID", (req, res) => {
  const game = global.getGameServer(req.params.roomID);
  if (game) {
    res.send({
      success: true,
      is_owner: false,
      options: [],
      result: {
        connected_players: 0,
        country: "NA",
        created_at: 0,
        for_invite: 1,
        hash: game.roomID,
        ip: "sn-game-na.herokuapp.com",
        is_mobile: 0,
        is_private: 1,
        level: 0,
        looking_for_players: 0,
        map: game.map,
        max_player: 4,
        server: "sn-game-na.herokuapp.com",
        server_code: "1.0.0",
        updated_at: 0,
      },
    });
  } else {
    res.send({
      success: true,
      message: "Could not find room",
    });
  }
});

router.get("/create-game/:id/:serverLinkPass", (req, res) => {
  if (req.params.serverLinkPass != process.env.SERVER_LINK_PASS) {
    res.status(403);
    res.send("Incorrect server link password");
  } else {
    try {
      global.createGameServer(req.params.id);
      res.send("Created game server");
    } catch (error) {
      res.status(500);
      res.send(error.message);
    }
  }
});

module.exports = router;
