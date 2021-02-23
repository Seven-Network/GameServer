const router = require('express').Router();

router.get('/', (_, res) => {
  res.send('Welcome to the Seven Network game server ✨');
});

router.get('/get-game/:id/:serverLinkPass', (req, res) => {
  if (req.params.serverLinkPass != process.env.SERVER_LINK_PASS) {
    res.status(403);
    res.send('Incorrect server link password');
  } else {
    try {
      if (global.gameServers[req.params.id]) {
        const gameServer = global.gameServers[req.params.id];
        res.json({
          map: gameServer.map,
          mode: gameServer.mode,
        });
      } else {
        res.status(400);
        res.send('Game does not exist');
      }
    } catch (error) {
      console.error(error);
      res.status(500);
      res.send(error.message);
    }
  }
});

router.get('/create-game/:id/:map/:serverLinkPass', (req, res) => {
  if (req.params.serverLinkPass != process.env.SERVER_LINK_PASS) {
    res.status(403);
    res.send('Incorrect server link password');
  } else {
    try {
      global.createGameServer(req.params.id, req.params.map);
      res.send('Created game server');
    } catch (error) {
      console.error(error);
      res.status(500);
      res.send(error.message);
    }
  }
});

module.exports = router;
