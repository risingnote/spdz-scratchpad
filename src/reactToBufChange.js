/**
 * TODO Not the right solution - look at making observed class an EventEmitter.  
 * class Foo extends EventEmitter {}
 */

const Bacon = require('baconjs').Bacon
const logger = require('./logging')

let values = [1, 2]

const arrayStream = Bacon.fromArray(values)

arrayStream.onValue(value => {
  logger.info(`Stream value ${value}.`)
})

setTimeout(() => {
  values.push(3)
  logger.info(`values is now ${values}`)
}, 2000)
