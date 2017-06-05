const Io = require('socket.Io-client')
const Bacon = require('baconjs').Bacon
const assert = require('assert')
const spdzGuiLib = require('spdz-gui-lib')
const logger = require('./logging')

const publishBus = Bacon.Bus()

const extractMessageType = (binaryData => {
  assert(binaryData instanceof Uint8Array, `Message from SPDZ should be a Uint8Array type, got a ${typeof binaryData}.`)
  assert(binaryData.length >= 4, `Message from SPDZ must be at least 4 bytes, given${binaryData.length}.`)

  const messageTypeBytes = binaryData.slice(0, 4)
  const remainingBytes = binaryData.slice(4)

  const messageType = spdzGuiLib.binaryToIntArray([messageTypeBytes])[0]

  return [messageType, remainingBytes]
})

const connectToProxy = (userOptions, ...proxyList) => {
  const connectOptions = Object.assign(
    {},
    {
      path: '/test/socket.io',
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 5000,
      timeout: 2000,
      autoConnect: true
    },
    userOptions
  )

  let connectionsStreamList = []
  let responsesStreamList = []
  let sharesStreamList = []
  let outputsStreamList = []

  for (const proxy of proxyList) {
    const [connectionStream, responsesStream, sharesStream, outputsStream] = connectSetup(connectOptions, proxy.url, proxy.encryptionKey)
    connectionsStreamList.push(connectionStream)
    responsesStreamList.push(responsesStream)
    sharesStreamList.push(sharesStream)
    outputsStreamList.push(outputsStream)
  }

  const combinedConnectionStream = Bacon.zipAsArray(connectionsStreamList)
  const combinedResponsesStream = Bacon.zipAsArray(responsesStreamList)
  const combinedSharesStream = Bacon.zipAsArray(sharesStreamList)
  const combinedOutputsStream = Bacon.zipAsArray(outputsStreamList)

  //Validation on shares stream
  combinedSharesStream.onValue(value => {
    //TODO
    spdzGuiLib.sharesFromTriples()
  })

  return [combinedConnectionStream, combinedResponsesStream, combinedSharesStream, combinedOutputsStream]
}

const connectSetup = (connectOptions, url, encryptionKey) => {
  const socket = Io.connect(url, connectOptions)

  //***************************************
  // Wrap socket events in Bacon (reactive)
  //***************************************
  const connectionStream = Bacon.fromBinder(sink => {
    socket.on('connect', () => {
      sink({ status: 0, msg: `websocket connection for ${url}` })
    })

    socket.on('connect_error', () => {
      sink({ status: 1, msg: `Connection error for ${url}.` })
    })

    socket.on('connect_timeout', () => {
      sink({ status: 2, msg: `Connection timeout for ${url}.` })
    })

    //Used for unsubscribe tidy up
    return () => {}
  })

  // Gather response messages into single stream 
  // status 0 - good, 1 - bad
  const responsesStream = Bacon.fromBinder(sink => {
    socket.on('connectToSpdz_result', (status, err) => {
      sink({ type: 'connectToSpdz_result', status: status, url: url, err: err })
    })

    //Used for unsubscribe tidy up
    return () => {}
  })

  //Decrypt, then work out type from first 4 bytes, rest is data
  // Errors get propagated to be caught in all follow on stream.onError handlers
  const spdzMessageStream = Bacon.fromEvent(socket, 'spdz_message', (value => {
    try {
      const clearValue = spdzGuiLib.decrypt(encryptionKey, value)

      const [messageType, remainingData] = extractMessageType(clearValue)

      if (messageType !== 1 && messageType !== 2) {
        throw new Error(`Unknown message type ${messageType}.`)
      }

      return { type: messageType, data: remainingData }
    } catch (err) {
      return new Bacon.Error(err.message + ` Proxy ${url}.`)
    }
  }))

  // shares are always arrays of 128bit bigintegers 
  const sharesStream = spdzMessageStream.filter(value => value.type === 1).map(value => value.data)

  // outputs are always arrays of 32 bit integers
  const outputsStream = spdzMessageStream.filter(value => value.type === 2).map(value => value.data)
  
  publishBus.onValue(value => {
    if (value.eventType === 'connectToSpdz') {
      socket.emit(
        value.eventType,
        value.publicKey,
        value.reuseConnection
      )
    } else {
      logger.warn(`Don't know what to do with event type ${value.eventType}`)
    }
  })

  return [connectionStream, responsesStream, sharesStream, outputsStream]
}

// Used if autoConnect is false, Returns immediately
//const socket = socketManager.connect()

module.exports = {
  connectToSPDZProxy: connectToProxy,
  publishStream: publishBus
}
