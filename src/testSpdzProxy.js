const logger = require('./logging')
const webSocketClient = require('./webSocketClient')
const spdzGuiLib = require('spdz-gui-lib')

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

/**
 * Subscribe to streams
 */
// Value is map with status (0 - good, 1 - connect error, 2 - timeout) and msg
combinedConnectionStream.onValue(value => {
  logger.info('Web socket connection response.', value)
  webSocketClient.connectToSpdz(devPublicKey, false)
})

combinedResponsesStream.onValue(responseList => {
  logger.info('SPDZ response message.', responseList)
})

combinedSharesStream.onValue(shareGfpList => {
  logger.info(`Got ${shareGfpList.length} SPDZ shares.`)
})

combinedSharesStream.onError(err => {
  logger.warn('SPDZ shares error.', err)
})

combinedOutputsStream.onValue(valueList => {
  logger.info('SPDZ outputs message.', valueList)
})

combinedOutputsStream.onError(err => {
  logger.warn('SPDZ outputs error.', err)
})

//Simulate user input 
setTimeout( () => webSocketClient.sendInput([446]), 2000)


