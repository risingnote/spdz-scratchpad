const logger = require('./logging')
const spdzGuiLib = require('spdz-gui-lib')

// Store client keys for testing
const devPublicKey = '976bff74308a0ab25c3ed90a93b72c0371c01bfcff0d030d02235628318d7e41'
spdzGuiLib.setDHKeyPair(devPublicKey,
                        '542718d18434eda89242e06fbc3e644a3969fe64fcd4e3379346b06f0e30bbae')

spdzGuiLib.connectToProxiesPromise(
  [{ url: 'http://localhost:3010/spdzapi', encryptionKey: spdzGuiLib.createEncryptionKey ('a0cbb39edee111854976b3c9c4a9ff1f0bba51749076a81f62a0fbbc56a46f05')},
  { url: 'http://localhost:3011/spdzapi', encryptionKey: spdzGuiLib.createEncryptionKey('81aae0a8cc0ac5a6b59c7026df19d4db9d86df75e7948555706aa9299ca67770')}],
    {},
    devPublicKey
).then(streams => {
  logger.info('Connected successfully to SPDZ engines.')
  const [spdzResultStream, spdzErrorStream] = streams
  spdzResultStream.onValue(valueList => {
    logger.info('SPDZ outputs message.', valueList)
  })
  spdzErrorStream.onError(err => {
    logger.warn('SPDZ err message.', err)
  })
})
.catch(err => {
  logger.warn(`Unable to connect to SPDZ engines. ${err.message}.`)
})


//Simulate user input 
// setTimeout( () => socketApi.sendInput([1481<<10,3<<10]), 2000)
setTimeout( () => {
  spdzGuiLib.sendInputsPromise([123])
  .then(() => {
    logger.debug('Inputs sent to SPDZ.')
  })
  .catch(err => {
    logger.warn(`Unable to send inputs. ${err.message}.`)
  })
}
, 2000)
