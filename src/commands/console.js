// @flow

import {buildCommand} from '../helpers'
import Dyno from '../dyno'
import {Command, flags} from 'cli-engine-heroku'

export default class RunConsole extends Command {
  static topic = 'console'
  static hidden = true
  static flags = {
    app: flags.app(),
    remote: flags.remote(),
    size: flags.string({char: 's', description: 'dyno size'}),
    env: flags.string({char: 'e', description: "environment variables to set (use ';' to split multiple vars)"})
  }

  async run () {
    const dyno = new Dyno({
      output: this.out,
      heroku: this.heroku,
      app: this.flags.app,
      command: buildCommand(['console']),
      size: this.flags.size,
      env: this.flags.env,
      attach: true
    })
    await dyno.start()
  }
}
