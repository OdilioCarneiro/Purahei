// app.js

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

var createError   = require('http-errors');
var express       = require('express');
var path          = require('path');
var cookieParser  = require('cookie-parser');
var logger        = require('morgan');

// Rotas
var indexRouter   = require('./routes/index');
var spotifyRouter = require('./routes/spotify');
var historyRouter = require('./routes/history');


var app = express();

const mongoose = require('mongoose');


mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Mongo connected'))
  .catch(err => console.error('Mongo error', err));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());


app.use(express.static(path.join(__dirname, 'public'))); 


app.use('/', indexRouter);

app.use('/api/spotify', spotifyRouter);

app.use('/api/history', historyRouter);

app.use(function (req, res, next) {
  next(createError(404));
});

// handler de erro
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error'); 
});

module.exports = app;
