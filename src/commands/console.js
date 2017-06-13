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
    let apps = await this.heroku.get('/apps/jkmparanoid/config-vars')
    console.dir(apps)
    // const dyno = new Dyno({
    //   heroku: this.legacyHerokuClient,
    //   app: this.flags.app,
    //   command: buildCommand(['console']),
    //   size: context.flags.size,
    //   env: context.flags.env,
    //   attach: true
    // })
    // await dyno.start()
  }
}
