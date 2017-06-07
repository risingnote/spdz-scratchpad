const Io = require('socket.Io-client')
const Bacon = require('baconjs').Bacon
const assert = require('assert')
const spdzGuiLib = require('spdz-gui-lib')
const logger = require('./logging')

const publishBus = Bacon.Bus()

// Matches SPDZ Processer/instruction.h
const REG_TYPE = {
  MODP: 0,
  GF2N: 1,
  INT: 2,
  MAX_REG_TYPE: 3,
  NONE: 4
}

const MESSAGE_TYPE = {
  NOTYPE: 0,
  INPUT_SHARE: 1,
  OUTPUT_RESULT: 2
}

const extractMessageStructure = (binaryData => {
  assert(binaryData instanceof Uint8Array, `Message from SPDZ should be a Uint8Array type, got a ${typeof binaryData}.`)
  assert(binaryData.length >= 8, `Message from SPDZ must be at least 8 bytes, given${binaryData.length}.`)

  const messageType = spdzGuiLib.binaryToIntArray([binaryData.slice(0, 4)])[0]
  const regType = spdzGuiLib.binaryToIntArray([binaryData.slice(4, 8)])[0]
  const remainingBytes = binaryData.slice(8)

  return [messageType, regType, remainingBytes]
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

  //Validation on shares stream (map and convert before publish)
  //Returns Array of Gfp
  const extractedSharesStream = combinedSharesStream.flatMap(byteBufferList => {
    try {
      return spdzGuiLib.binaryToShare(byteBufferList)
    } catch (err) {
      return new Bacon.Error(err.message)
    }
  })

  //Validation on outputs stream and convert to int array from byte array
  // dataList is array of objects (regType, data)
  // Uses regType MODP (16) or INT (4) to determine parsing.
  const extractedOutputStream = combinedOutputsStream.flatMap(dataList => {
    try {
      const regType = dataList.reduce((result, output) => result = output.regType, REG_TYPE.NONE)
      const byteBufferList = dataList.map(output => output.data)

      if (regType === REG_TYPE.MODP) {
        const gfpResultList = spdzGuiLib.binaryToGfpArray(byteBufferList, true)

        return gfpResultList.map(gfp => gfp.toJSNumber())
      } else if (regType === REG_TYPE.INT) {
        return spdzGuiLib.binaryToIntArray(byteBufferList)
      } else {
        throw new Error(`Got output stream with regType ${regType} not currently handled.`)
      }
    } catch (err) {
      return new Bacon.Error(err.message)
    }
  })
  
  return [combinedConnectionStream, combinedResponsesStream, extractedSharesStream, extractedOutputStream]
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

    socket.on('sendData_result', (status, err) => {
      sink({ type: 'sendData_result', status: status, url: url, err: err })
    })

    //Used for unsubscribe tidy up
    return () => {}
  })

  //Decrypt, then work out message type and data type, rest is data
  // Errors get propagated to be caught in all follow on stream.onError handlers
  const spdzMessageStream = Bacon.fromEvent(socket, 'spdz_message', (value => {
    try {
      const clearValue = spdzGuiLib.decrypt(encryptionKey, value)

      const [messageType, regType, remainingData] = extractMessageStructure(clearValue)

      if (messageType !== MESSAGE_TYPE.INPUT_SHARE && 
          messageType !== MESSAGE_TYPE.OUTPUT_RESULT) {
        throw new Error(`Unknown message type ${messageType}.`)
      }

      if (regType !== REG_TYPE.MODP && 
          regType !== REG_TYPE.INT) {
        throw new Error(`Unknown data type ${regType}.`)
      }

      return { messageType: messageType, regType: regType, data: remainingData }
    } catch (err) {
      return new Bacon.Error(err.message + ` Proxy ${url}.`)
    }
  }))

  // Shares doesn't need dataType, always MODP and so 16 byte integers.
  const sharesStream = spdzMessageStream
    .filter(value => value.messageType === MESSAGE_TYPE.INPUT_SHARE)
    .map(value => {
      return value.data 
    })

  // Forward on regType, parsing depends on MODP (16) or INT (4) byte integers.
  const outputsStream = spdzMessageStream
    .filter(value => value.messageType === MESSAGE_TYPE.OUTPUT_RESULT)
    .map(value => {
      return { regType: value.regType, data: value.data }
    })
  
  publishBus.onValue(value => {
    if (value.eventType === 'connectToSpdz') {
      socket.emit(
        value.eventType,
        value.publicKey,
        value.reuseConnection
      )
    } else if (value.eventType === 'sendData') {
      socket.emit(
        value.eventType,
        value.data
      )
    } 
    else {
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
