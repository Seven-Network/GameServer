const router = require("express").Router();

router.get("/", (_, res) => {
  res.send("Welcome to the Seven Network invite server ✨");
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
