'use strict'

let co = require('co')
let cli = require('heroku-cli-util')
let helpers = require('../lib/helpers')
let Dyno = require('../lib/dyno')

function * run (context, heroku) {
  let opts = {
    heroku: heroku,
    app: context.app,
    command: helpers.buildCommand(context.args),
    size: context.flags.size,
    'exit-code': context.flags['exit-code'],
    env: context.flags.env,
    'no-tty': context.flags['no-tty']
  }
  if (!opts.command) throw new Error('Usage: heroku run COMMAND\n\nExample: heroku run bash')

  let dyno = new Dyno(opts)
  yield dyno.start()
  yield dyno.attach()
}

module.exports = {
  topic: 'run',
  description: 'run a one-off process inside a heroku dyno',
  help: `
Examples:

  $ heroku run bash
  Running bash on app.... up, run.1
  ~ $

  $ heroku run -s hobby -- myscript.sh -a arg1 -s arg2
  Running myscript.sh -a arg1 -s arg2 on app.... up, run.1
`,
  variableArgs: true,
  needsAuth: true,
  needsApp: true,
  flags: [
    {name: 'size', char: 's', description: 'dyno size', hasValue: true},
    {name: 'exit-code', description: 'passthrough the exit code of the remote command'},
    {name: 'env', description: "environment variables to set (use ';' to split multiple vars)", hasValue: true},
    {name: 'no-tty', description: 'force the command to not run in a tty', hasValue: false}
  ],
  run: cli.command(co.wrap(run))
}
