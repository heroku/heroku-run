// @flow

import {buildCommand} from './helpers'

describe('helpers.buildCommand()', () => {
  [
    {args: ['echo foo'], expected: 'echo foo'},
    {args: ['echo', 'foo bar'], expected: 'echo "foo bar"'},
    {args: ['echo', 'foo', 'bar'], expected: 'echo foo bar'},
    {args: ['echo', '{"foo": "bar"}'], expected: 'echo "{\\"foo\\": \\"bar\\"}"'},
    {args: ['echo', '{"foo":"bar"}'], expected: 'echo "{\\"foo\\":\\"bar\\"}"'}
  ].forEach(example => {
    test(`parses \`${example.args.join(' ')}\` as ${example.expected}`, () => {
      expect(buildCommand(example.args)).toEqual(example.expected)
    })
  })
})
