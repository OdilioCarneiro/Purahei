// routes/index.js
var express = require('express');
var router = express.Router();

/* GET home page */
router.get('/', function (req, res) {
  res.render('index', { title: 'Puraheí' });
});

/* GET game page */
router.get('/jogo', function (req, res) {
  res.render('jogo', { title: 'Purahéi' });
});

router.get('/about', function (req, res) {
  res.render('about', { title: 'Puraheí' });
});

router.get('/historico', function (req, res) {
  res.render('historico', { title: 'Puraheí' });
});

router.get('/health', function (req, res) {
  res.status(200).send('ok');
});

module.exports = router;
