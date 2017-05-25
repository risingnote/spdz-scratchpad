const logger = require('./logging')
const webSocketClient = require('./webSocketClient')

const [
  combinedConnectionStream,
  combinedMessageStream
] = webSocketClient.connectToSPDZProxy(
  {},
  'http://localhost:8080/test',
  'http://localhost:8081/test'
)

/**
 * Subscribe to streams
 */
// Only if all connect OK.
combinedConnectionStream.onValue(value => {
  logger.info(`Stream value ${value}.`)
  webSocketClient.publishStream.push('0102030405')
})
// If any don't connect, or lose connection
combinedConnectionStream.onError(error => {
  logger.warn(`Stream error ${error}.`)
})

combinedMessageStream.onValue(value => {
  logger.info(`Stream SPDZ message ${value}`)
})
