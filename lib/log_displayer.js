'use strict'

let cli = require('heroku-cli-util')
let EventSource = require('eventsource')
let url = require('url')

const COLORS = [
  s => cli.color.yellow(s),
  s => cli.color.green(s),
  s => cli.color.cyan(s),
  s => cli.color.magenta(s),
  s => cli.color.blue(s),
  s => cli.color.bold.green(s),
  s => cli.color.bold.cyan(s),
  s => cli.color.bold.magenta(s),
  s => cli.color.bold.yellow(s),
  s => cli.color.bold.blue(s)
]
const assignedColors = {}
function getColorForIdentifier (i) {
  if (assignedColors[i]) return assignedColors[i]
  assignedColors[i] = COLORS[Object.keys(assignedColors).length % COLORS.length]
  return assignedColors[i]
}

// get initial colors so they are the same every time
getColorForIdentifier('run')
getColorForIdentifier('router')
getColorForIdentifier('web')
getColorForIdentifier('postgres')
getColorForIdentifier('heroku-postgres')

let lineRegex = /^(.*?\[([\w-]+)([\d.]+)?]:)(.*)?$/
function colorize (line) {
  let parsed = line.match(lineRegex)
  if (!parsed) return line
  let header = parsed[1]
  let identifier = parsed[2]
  let body = parsed[4]
  return getColorForIdentifier(identifier)(header) + body
}

function readLogs (logplexURL) {
  return new Promise(function (resolve, reject) {
    let u = url.parse(logplexURL, true)
    let isTail = u.query.tail && u.query.tail === 'true'
    let userAgent = process.env.HEROKU_DEBUG_USER_AGENT || 'heroku-run';
    let es = new EventSource(logplexURL, { headers: { 'User-Agent': userAgent }})

    es.onerror = function (err) {
      if (!isTail) {
        resolve()
        es.close()
      }

      if (err && (err.status === 404 || err.status === 403)) {
        reject(err)
        es.close()
      }
    }

    es.onmessage = function (e) {
      e.data.split(/\n+/).forEach((line) => {
        cli.log(colorize(line.trim()))
      })
    }
  })
}

function logDisplayer (heroku, options) {
  process.stdout.on('error', () => process.exit(1))
  return heroku.request({
    path: `/apps/${options.app}/log-sessions`,
    method: 'POST',
    body: {
      tail: options.tail,
      dyno: options.dyno,
      source: options.source,
      lines: options.lines
    }
  })
    .then(response => readLogs(response.logplex_url))
}

module.exports = logDisplayer
module.exports.COLORS = COLORS
