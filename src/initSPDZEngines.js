/**
 * Connect to SPDZ engines
 */
const spdzGuiLib = require('spdz-gui-lib')
const configForEnv = require('./configForEnv')
const logger = require('./logging')

// Get fixed values to send at startup
let voterIds = configForEnv('voterIds')
if (voterIds.length > 100) {
  throw new Error(`Up to 100 voter ids supported, got ${voterIds.length}.`)
} else if (voterIds.length < 100) {
  voterIds = voterIds.concat((new Array(100 - voterIds.length)).fill(0))
}

const workshopSchedule = require('../config/workshopSchedule')
let talkIds = workshopSchedule.filter( (talk) => {
  return (talk.infoOnly === undefined || talk.infoOnly === 'false')
 }).map( (talk) => talk.id )

if (talkIds.length > 40) {
  throw new Error(`Up to 40 talk ids supported, got ${talkIds.length}.`)
} else if (talkIds.length < 40) {
  talkIds = talkIds.concat((new Array(40 - talkIds.length)).fill(0))
}

/**
 * A function to run a promise, if succeeds then resolve otherwise rerun promise in interval.
 * @return Promise which resolves promiseToRetry (no return) or rejects with error.
 */
const retryWithInterval = (promiseToRetry, retryIntervalSecs, maxAttemptCount) => {
  return new Promise(function (resolve, reject) {
    let connectCount = 1;
    promiseToRetry()
      .then(() => {
        logger.info(`Succeeded on attempt ${connectCount}`)
        resolve()
      })
      .catch((err) => {
        logger.info(`Failed on attempt ${connectCount}, will retry in ${retryIntervalSecs} secs.`)
        logger.debug(`${err}.`)

        connectIntervalId = setInterval(() => {
          connectCount += 1
          promiseToRetry()
            .then(() => {
              logger.info(`Succeeded on attempt ${connectCount}`)              
              clearInterval(connectIntervalId)
              resolve()
            })
            .catch((err) => {
              if (connectCount >= maxAttemptCount) {
                logger.info(`Failed on attempt ${connectCount}, no more retries.`)
                clearInterval(connectIntervalId)
                reject(err)
              } else {
                logger.info(`Failed on attempt ${connectCount}, will retry in ${retryIntervalSecs} secs.`)
                logger.debug(`${err}.`)
              }
            })
        }, retryIntervalSecs * 1000)

      })
    })
  }

/**
 * Create a function to run spdz connect to proxies.
 * @return Function which when run, returns promise which will resolve if connection OK,
 *         or reject with error reason. 
 */
const proxyConnect = (spdzProxyList, spdzApiRoot, dhPublicKey) => {
  return () => {
    return spdzGuiLib.connectToProxies(spdzProxyList.map(spdzProxy => spdzProxy.url),
      spdzApiRoot, dhPublicKey)
      .then((values) => {
        if (spdzGuiLib.allProxiesConnected(values)) {
          return
        }
        else {
          return Promise.reject(
            new Error('Unable to connect to all Spdz Proxy Servers ' + JSON.stringify(values)))
        }
      })
  }
}

const initSPDZ = (spdzProxyList, spdzApiRoot, dhPublicKey) => {
  logger.info("Connecting to SPDZ proxies.")
  return retryWithInterval( proxyConnect(spdzProxyList, spdzApiRoot, dhPublicKey), 15, 4)
    .then(() => {
      logger.info("Sending voter ids to SPDZ Engines.")
      return spdzGuiLib.sendInputsWithShares(voterIds, true, spdzProxyList, spdzApiRoot, dhPublicKey, 1000)
    })
    .then(() => {
      logger.info("Sending talk ids to SPDZ Engines.")      
      return spdzGuiLib.sendInputsWithShares(talkIds, true, spdzProxyList, spdzApiRoot, dhPublicKey, 1000)      
    })
}

module.exports = initSPDZ