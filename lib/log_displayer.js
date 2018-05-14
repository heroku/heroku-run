'use strict'

let cli = require('heroku-cli-util')
let EventSource = require('eventsource')
let url = require('url')
let liner = require('../lib/line_transform')
const colorize = require('./colorize')

async function logDisplayer (heroku, options) {
  function readLogs (logplexURL) {
    let u = url.parse(logplexURL)
    if (u.query && u.query.includes('srv')) {
      return readLogsV1(logplexURL)
    } else {
      return readLogsV2(logplexURL)
    }
  }

  function readLogsV1 (logplexURL) {
    return new Promise(function (resolve, reject) {
      let res = cli.got.stream(logplexURL)
      res.setEncoding('utf8')
      liner.setEncoding('utf8')
      res.pipe(liner)
      liner.on('data', line => cli.log(colorize(line)))
      res.on('end', resolve)
      res.on('error', reject)
    })
  }

  function readLogsV2 (logplexURL) {
    return new Promise(function (resolve, reject) {
      const u = url.parse(logplexURL, true)
      const isTail = u.query.tail && u.query.tail === 'true'
      const userAgent = process.env.HEROKU_DEBUG_USER_AGENT || 'heroku-run'
      const proxy = process.env.https_proxy || process.env.HTTPS_PROXY
      const es = new EventSource(logplexURL, {
        proxy,
        headers: {
          'User-Agent': userAgent
        }
      })
      let lines = 0

      es.onerror = function (err) {
        if (!isTail) {
          if (lines === 0) {
            // if app emits too many logs logplex will not return historical logs
            // in this case, tail instead
            logDisplayer(heroku, {
              ...options,
              tail: true
            }).then(resolve).catch(reject)
            return
          }
          resolve()
          es.close()
        }

        if (err && (err.status === 404 || err.status === 403)) {
          reject(new Error('Log stream timed out. Please try again.'))
          es.close()
        }
      }

      es.onmessage = function (e) {
        e.data.trim().split(/\n+/).forEach(line => {
          cli.log(colorize(line))
          lines++
          if (typeof options.lines === 'number' && lines >= options.lines) es.close()
        })
      }
    })
  }

  process.stdout.on('error', err => {
    if (err.code === 'EPIPE') {
      process.exit(0)
    } else {
      console.error(err.stack)
      process.exit(1)
    }
  })
  const response = await heroku.request({
    path: `/apps/${options.app}/log-sessions`,
    method: 'POST',
    body: {
      tail: options.tail,
      dyno: options.dyno,
      source: options.source,
      lines: options.lines
    }
  })
  return readLogs(response.logplex_url)
}

module.exports = logDisplayer
