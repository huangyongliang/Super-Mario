/* Loads the DOM-free simulation core into Node so that levels can be played without a browser. */
'use strict';

const path = require('path');

['config', 'level-data', 'level-loader', 'world', 'player', 'entities'].forEach(function (name) {
  require(path.join(__dirname, '..', 'js', name + '.js'));
});

module.exports = globalThis.SM;
