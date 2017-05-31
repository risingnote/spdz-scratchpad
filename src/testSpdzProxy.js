const logger = require('./logging')
const webSocketClient = require('./webSocketClient')

const [
  combinedConnectionStream,
  combinedResultsStream,
  combinedMessageStream
] = webSocketClient.connectToSPDZProxy(
  {
    path: '/spdzapi/socket.io'
  },
  'http://localhost:3010/spdzapi',
  'http://localhost:3011/spdzapi'
)

/**
 * Subscribe to streams
 */
// Value is map with status (0 - good, 1 - connect error, 2 - timeout) and msg
combinedConnectionStream.onValue(value => {
  logger.info(value)

  webSocketClient.publishStream.push({
    eventType: 'connectToSpdz',
    publicKey: '0102030405060708010203040506070801020304050607080102030405060708',
    reuseConnection: false
  })
})

combinedResultsStream.onValue(value => {})

combinedMessageStream.onValue(value => {
  logger.info(`Stream SPDZ message ${value}`)
})
