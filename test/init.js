// @flow

global.apikey = process.env.HEROKU_API_KEY
if (!global.apikey) global.apikey = require('netrc')()['api.heroku.com'].password
