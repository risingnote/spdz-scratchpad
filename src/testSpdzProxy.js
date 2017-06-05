const logger = require('./logging')
const webSocketClient = require('./webSocketClient')
const spdzGuiLib = require('spdz-gui-lib')
const Bacon = require('baconjs').Bacon

// Store client keys for testing
const devPublicKey = '976bff74308a0ab25c3ed90a93b72c0371c01bfcff0d030d02235628318d7e41'
spdzGuiLib.setDHKeyPair(devPublicKey,
                        '542718d18434eda89242e06fbc3e644a3969fe64fcd4e3379346b06f0e30bbae')

const [
  combinedConnectionStream,
  combinedResponsesStream,
  combinedSharesStream,
  combinedOutputsStream
] = webSocketClient.connectToSPDZProxy(
  {
    path: '/spdzapi/socket.io'
  },
  { url: 'http://localhost:3010/spdzapi', encryptionKey: spdzGuiLib.createEncryptionKey('a0cbb39edee111854976b3c9c4a9ff1f0bba51749076a81f62a0fbbc56a46f05')},
  { url: 'http://localhost:3011/spdzapi', encryptionKey: spdzGuiLib.createEncryptionKey('81aae0a8cc0ac5a6b59c7026df19d4db9d86df75e7948555706aa9299ca67770')}
)

//a0cbb39edee111854976b3c9c4a9ff1f0bba51749076a81f62a0fbbc56a46f05
/**
 * Subscribe to streams
 */
// Value is map with status (0 - good, 1 - connect error, 2 - timeout) and msg
combinedConnectionStream.onValue(value => {
  logger.info('Web socket connection response.', value)

  webSocketClient.publishStream.push({
    eventType: 'connectToSpdz',
    publicKey: devPublicKey,
    reuseConnection: false
  })
})

combinedResponsesStream.onValue(value => {
  logger.info('SPDZ response message.', value)
})

combinedSharesStream.onValue(value => {
  logger.info(`Got ${value.length} SPDZ shares. Share bytes is ${value[0].length}.`)
})

combinedSharesStream.onError(err => {
  logger.info('SPDZ shares error.', err)
})

combinedOutputsStream.onValue(value => {
  logger.info('SPDZ outputs message.', value)
})

combinedOutputsStream.onError(err => {
  logger.info('SPDZ outputs error.', err)
})

//Simulate user input
const userInputStream = Bacon.fromArray([446])




