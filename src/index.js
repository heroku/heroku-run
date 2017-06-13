// @flow

import path from 'path'
import fs from 'fs'

export {default as Dyno} from './dyno'

export const topics = [{
  name: 'run',
  description: 'run a one-off process inside a Heroku dyno'
}, {
  name: 'logs',
  description: 'display recent log output'
}]

export const commands = [require('./commands/console')]
// export const commands = fs.readdirSync(path.join(__dirname, 'commands'))
//   .filter(f => path.extname(f) === '.js')
//   // flow$ignore
//   .map(f => require('./commands/' + f))
