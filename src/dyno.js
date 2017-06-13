// @flow

import tls from 'tls'
import url from 'url'
import tty from 'tty'
import stream from 'stream'
import {buildEnvFromFlag} from './helpers'
import {type APIClient} from 'cli-engine-heroku'
import type Output from 'cli-engine-command/lib/output'

const http = require('https')
const net = require('net')
const spawn = require('child_process').spawn

export type DynoOptions = {
  heroku: APIClient,
  'exit-code'?: boolean,
  command: string,
  app: string,
  attach: ?boolean,
  size: ?string,
  'no-tty'?: boolean,
  env?: {[k: string]: string},
  showStatus?: boolean,
  output: Output,
  dyno?: string
}

/** Represents a dyno process */
export default class Dyno {
  opts: DynoOptions
  heroku: APIClient
  out: Output
  dyno: any
  uri: any
  resolve: () => void
  reject: (string) => void
  unpipeStdin: ?() => void

  /**
   * @param {Object} options
   * @param {Object} options.heroku - instance of heroku-client
   * @param {boolean} options.exit-code - get exit code from process
   * @param {string} options.command - command to run
   * @param {string} options.app - app to run dyno on
   * @param {boolean} options.attach - attach to dyno
   * @param {string} options.size - size of dyno to create
   * @param {boolean} options.no-tty - force not to use a tty
   * @param {Object} options.env - dyno environment variables
  */
  constructor (opts: DynoOptions) {
    this.out = opts.output
    this.opts = opts
    this.heroku = opts.heroku
    if (this.opts.showStatus === undefined) this.opts.showStatus = true
  }

  /**
   * Starts the dyno
   * @returns {Promise} promise resolved when dyno process is created
   */
  async start () {
    let color = this.out.color
    let command = this.opts['exit-code'] ? `${this.opts.command}; echo "\uFFFF heroku-command-exit-status $?"` : this.opts.command
    if (this.opts.showStatus) {
      this.out.action.start(`Running ${color.cyan.bold(this.opts.command)} on ${color.app(this.opts.app)}`)
    }
    this.dyno = await this.heroku.post(
      this.opts.dyno ? `/apps/${this.opts.app}/dynos/${this.opts.dyno}` : `/apps/${this.opts.app}/dynos`, {
        headers: {
          Accept: this.opts.dyno ? 'application/vnd.heroku+json; version=3.run-inside' : 'application/vnd.heroku+json; version=3'
        },
        body: {
          command: command,
          attach: this.opts.attach,
          size: this.opts.size,
          env: this._env(),
          force_no_tty: this.opts['no-tty']
        }
      })
    if (this.opts.attach || this.opts.dyno) {
      if (this.dyno.name && this.opts.dyno === undefined) this.opts.dyno = this.dyno.name
      return this.attach()
    } else if (this.opts.showStatus) {
      this.out.action.stop(this._status('done'))
    }
  }

  /**
   * Attaches stdin/stdout to dyno
   */
  attach () {
    this.uri = url.parse(this.dyno.attach_url)
    if (this.uri.protocol === 'http:' || this.uri.protocol === 'https:') {
      return this._ssh()
    } else {
      return this._rendezvous()
    }
  }

  _rendezvous () {
    return new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject

      if (this.opts.showStatus) this.out.action.status = this._status('starting')
      // !(process.env.HEROKU_SSL_VERIFY === 'disable' || host.endsWith('herokudev.com'))
      let c = tls.connect(this.uri.port, this.uri.hostname, {rejectUnauthorized: this.heroku.options.rejectUnauthorized})
      c.setTimeout(1000 * 60 * 20)
      c.setEncoding('utf8')
      c.on('connect', () => {
        c.write(this.uri.path.substr(1) + '\r\n', () => {
          if (this.opts.showStatus) this.out.action.status = this._status('connecting')
        })
      })
      c.on('data', this._readData(c))
      c.on('close', () => {
        this.opts['exit-code'] ? this.reject('No exit code returned') : this.resolve()
        if (this.unpipeStdin) this.unpipeStdin()
      })
      c.on('error', this.reject)
      process.once('SIGINT', () => c.end())
    })
  }

  async _ssh () {
    const interval = 30 * 1000
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    try {
      this.dyno = await this.heroku.get(`/apps/${this.opts.app}/dynos/${this.opts.dyno}`)
    } catch (err) {
      return wait(interval).then(this._ssh.bind(this))
    }
    this.out.action.stop(this._status(this.dyno.state))

    if (this.dyno.state === 'starting' || this.dyno.state === 'up') return this._connect()
    else return wait(interval).then(this._ssh.bind(this))
  }

  _connect () {
    return new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject

      let options = this.uri
      options.headers = {'Connection': 'Upgrade', 'Upgrade': 'tcp'}
      options.rejectUnauthorized = false
      let r = http.request(options)
      r.end()

      r.on('error', this.reject)
      r.on('upgrade', (_, remote, head) => {
        let s = net.createServer((client) => {
          client.on('end', () => {
            s.close()
            this.resolve()
          })
          client.on('connect', () => s.close())

          client.on('error', () => this.reject)
          remote.on('error', () => this.reject)

          client.setNoDelay(true)
          remote.setNoDelay(true)

          remote.on('data', (data) => client.write(data))
          client.on('data', (data) => remote.write(data))
        })

        s.listen(0, 'localhost', () => this._handle(s.address()))
      })
    })
  }

  _handle (options) {
    const host = options.address
    const port = options.port

    if (this.opts.listen) {
      this.out.log(`listening on port ${host}:${port} for ssh client`)
    } else {
      spawn('ssh', [host, '-p', port.toString(), '-oStrictHostKeyChecking=no', '-oUserKnownHostsFile=/dev/null', '-oServerAliveInterval=20'], {
        detached: false,
        stdio: 'inherit'
      })
    }
  }

  _env () {
    let c: {[k: string]: ?string} = this.opts.env ? buildEnvFromFlag(this.opts.env) : {}
    c.TERM = process.env.TERM
    if (tty.isatty(1)) {
      c.COLUMNS = (process.stdout: any).columns
      c.LINES = (process.stdout: any).rows
    }
    return c
  }

  _status (status: string) {
    let size = this.dyno.size ? ` (${this.dyno.size})` : ''
    return `${status}, ${this.dyno.name || this.opts.dyno}${size}`
  }

  _readData (c: stream$Writable) {
    let firstLine = true
    return (data: string) => {
      // discard first line
      if (firstLine) {
        if (this.opts.showStatus) this.out.action.stop(this._status('up'))
        firstLine = false
        this._readStdin(c)
        return
      }
      data = data.replace('\r\n', '\n')
      let exitCode = data.match(/\uFFFF heroku-command-exit-status (\d+)/m)
      if (exitCode) {
        process.stdout.write(data.replace(/^\uFFFF heroku-command-exit-status \d+$\n?/m, ''))
        let code = parseInt(exitCode[1])
        if (code === 0) this.resolve()
        else {
          let err: any = new Error(`Process exited with code ${this.out.color.red(code)}`)
          err.exitCode = code
          this.reject(err)
        }
        return
      }
      process.stdout.write(data)
    }
  }

  _readStdin (c: stream$Writable) {
    let stdin = process.stdin
    stdin.setEncoding('utf8')
    if (stdin.unref) (stdin: any).unref()
    if (tty.isatty(0)) {
      ;(stdin: any).setRawMode(true)
      stdin.pipe(c)
      let sigints = []
      stdin.on('data', function (c) {
        if (c === '\u0003') sigints.push(new Date())
        sigints = sigints.filter(d => d > new Date() - 1000)
        if (sigints.length >= 4) {
          this.out.error('forcing dyno disconnect')
        }
      })
    } else {
      stdin.pipe(new stream.Transform({
        objectMode: true,
        transform: (chunk, _, next) => c.write(chunk, next),
        flush: done => c.write('\x04', done)
      }))
    }
  }
}
