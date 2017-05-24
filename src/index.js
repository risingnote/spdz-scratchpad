/**
 * Test out SPDZ MPC client interactions.
 */

const spdzGuiLib = require('spdz-gui-lib')
// Polyfill for fetch, required when interacting with SPDZ Api functions in spdz-gui-lib.
// Pulls in node-fetch to global scope
require('isomorphic-fetch')
const logger = require('./logging')
const proxyConfig = require('../config/spdzProxy')
const dhKeyPair = require('../config/dhKeyPair-dev')

/**
 * Load pre-generated DH Key pair.
 * @returns String public key which must match value in SPDZ MPC program
 */
const setupDHKeys = () => {
  spdzGuiLib.setDHKeyPair(dhKeyPair.clientPublicKey, dhKeyPair.clientPrivateKey)
  return dhKeyPair.clientPublicKey
}

// Setup session encryption keys.
const dhPublicKey = setupDHKeys()
const spdzProxyList = proxyConfig.spdzProxyList.map(spdzProxy => {
  return {
    url: spdzProxy.url,
    encryptionKey: spdzGuiLib.createEncryptionKey(spdzProxy.publicKey)
  }
})

// Setup connection to SPDZ engines
spdzGuiLib
  .connectToProxies(
    spdzProxyList.map(spdzProxy => spdzProxy.url),
    proxyConfig.spdzApiRoot,
    dhPublicKey
  )
  .then(values => {
    if (spdzGuiLib.allProxiesConnected(values)) {
      return
    } else {
      return Promise.reject(
        new Error(
          'Unable to connect to all Spdz Proxy Servers ' +
            JSON.stringify(values)
        )
      )
    }
  })
  // Demo sending input in batches
  .then(() => {
    const input = Array.from({ length: 10 }, (v, i) => i + 1).concat(0)
    logger.debug(input)
    return spdzGuiLib.sendInputsWithShares(
      input,
      true,
      spdzProxyList,
      proxyConfig.spdzApiRoot,
      dhPublicKey,
      300
    )
  })
  .then(() => {
    const input = Array.from({ length: 10 }, (v, i) => i + 10).concat(1)
    logger.debug(input)
    return spdzGuiLib.sendInputsWithShares(
      input,
      true,
      spdzProxyList,
      proxyConfig.spdzApiRoot,
      dhPublicKey,
      300
    )
  })
  .catch(err => {
    logger.warn('Unable to initialise SPDZ engines, exiting.', err)
  })
