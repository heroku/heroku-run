'use strict';

let co     = require('co');
let cli    = require('heroku-cli-util');
let heroku_apps = require('heroku-apps').commands;

function* run (context, heroku) {
  let apps_info = heroku_apps.find(function(command) {
    return command.topic === 'apps' && command.command === 'info';
  });
  yield apps_info.run(context, heroku);
}

module.exports = {
  topic: 'run',
  command: 'test',
  needsAuth: true,
  needsApp: true,
  run: cli.command(co.wrap(run))
};
