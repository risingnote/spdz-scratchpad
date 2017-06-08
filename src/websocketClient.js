/**
 * Client side interface to SPDZ Proxy using web sockets.
 */
const Io = require('socket.Io-client')
const Bacon = require('baconjs').Bacon
const assert = require('assert')
const spdzGuiLib = require('spdz-gui-lib')
const logger = require('./logging')

/**
 * Identify type of numeric data in byte stream.
 * Matches SPDZ Processer/instruction.h
 */
const REG_TYPE = {
  MODP: 0,
  GF2N: 1,
  INT: 2,
  MAX_REG_TYPE: 3,
  NONE: 4
}

/**
 * Identify type of return message from SPDZ.
 * Matches SPDZ Processer/instruction.h
 */
const MESSAGE_TYPE = {
  NOTYPE: 0,
  INPUT_SHARE: 1,
  OUTPUT_RESULT: 2
}

/**
 * Identify the message in the rx response stream.
 */
const RESPONSE_TYPE = {
  PROXY_CONNECT: 'Proxy connect',
  CONNECT_TO_SPDZ: 'SPDZ connect',
  SEND_INPUT: 'send input',
  ERROR: 'error'
}

const webSocketBus = Bacon.Bus()
const userInputBus = Bacon.Bus()

/**
 * Parse a stream of bytes from SPDZ, extracting out the headers.
 * @param {Uint8Array} binaryData from SPDZ engine 
 * @returns {messageType} to indicate the purpose of the message
 * @returns {regType} to indicate the number type
 * @returns {remainingBytes} the remaining bytes 
 */
const extractMessageStructure = (binaryData => {
  assert(binaryData instanceof Uint8Array, `Message from SPDZ should be a Uint8Array type, got a ${typeof binaryData}.`)
  assert(binaryData.length >= 8, `Message from SPDZ must be at least 8 bytes, given${binaryData.length}.`)

  const messageType = spdzGuiLib.binaryToIntArray([binaryData.slice(0, 4)])[0]
  const regType = spdzGuiLib.binaryToIntArray([binaryData.slice(4, 8)])[0]
  const remainingBytes = binaryData.slice(8)

  return [messageType, regType, remainingBytes]
})

/**
 * From an array of buffers (1 per SPDZ engine) extract out and validate n shares.
 * The number is determined by the SPDZ MPC program.
 * 
 * @param {Array<Uint8Array>} byteBufferList 
 * @returns {Array<Gfp>} list of shares 
 */
const extractValidateShares = byteBufferList => {
  try {
    logger.debug('Received shares from SPDZ.')
    return spdzGuiLib.binaryToShare(byteBufferList)
  } catch (err) {
    return new Bacon.Error(err.message)
  }
}

/**
 * Validate and convert byte array to int array.
 * Uses regType returned by SPDZ - MODP (16 bytes GFP) or INT (4) to determine parsing.
 * @param {Array} dataList array of objects {regType, data} 
 * @returns {Array} Number type.
 */
const convertOutput = dataList => {
  try {
    logger.debug('Received output from SPDZ.')
    const regType = dataList.reduce(
      (result, output) => (result = output.regType),
      REG_TYPE.NONE
    )
    const byteBufferList = dataList.map(output => output.data)

    if (regType === REG_TYPE.MODP) {
      const gfpResultList = spdzGuiLib.binaryToGfpArray(byteBufferList, true)
      return gfpResultList.map(gfp => gfp.toJSNumber())
    } else if (regType === REG_TYPE.INT) {
      return spdzGuiLib.binaryToIntArray(byteBufferList)
    } else {
      throw new Error(
        `Got output stream with regType ${regType} not currently handled.`
      )
    }
  } catch (err) {
    return new Bacon.Error(err.message)
  }
}

/**
 * Setup the streams to combine sending user input with shares to SPDZ.
 * @param {EventStream} extractedSharesStream to be combined with inputs to send to SPDZ.
 * 
 * @returns {EventStream} sendValueStream to monitor for errors.
 */
const setupSendInputStream = (extractedSharesStream) => {
  // Need flatMap or errors are sent as values
  const sendValueStream = userInputBus.zip(extractedSharesStream).flatMap(inp_share => {
    const inputList = inp_share[0]
    const shareList = inp_share[1]
    if (inputList.length !== shareList.length) {
      const warnMsg = `Trying to send ${inputList.length} input(s) but ${shareList.length} share(s) suppled.`
      logger.warn(warnMsg)
      return new Bacon.Error(warnMsg)
    }
    return inputList.map((input, i) => {
      const sharedInput = shareList[i].add(spdzGuiLib.Gfp.fromString(input).toMontgomery())
      //TODO Doesn't need to be base64 encoded
      return spdzGuiLib.base64Encode(sharedInput.toHexString())
    })
  })

  sendValueStream.onValue(inputList => {
    logger.debug(`About to send ${inputList.length} input(s).`)
    webSocketBus.push({
      eventType: 'sendData',
      data: inputList
    })
  })

  return sendValueStream
}

const processResponseMessage = msg => {
  return {
    responseType: msg.reduce((a,b) => a = b.responseType, RESPONSE_TYPE.ERROR ),
    success: msg.reduce((a,b) => a = a && b.success, true),
    original: msg
  }
} 

/**
 * Connect to multiple SPDZ proxies using a websocket interface.
 * 
 * Returns 2 rx streams:
 *  Responses Stream: the responses from SPDZ, both expected
 *   and errors, where each stream value contains an array of:
 *     { responseType: see responseType values,
 *       success: true or false,
 *       url: proxy url (optional)
 *       msg: response msg }  
 *   Note that expected responses are aggregated from the SPDZ proxies,
 *   error messages are sent separately.   
 * 
 *  Output stream: the output values from SPDZ where 
 *   each stream value contains an Array<Integers>.
 * 
 * @param {Object} userOptions to override socket.io connection options. 
 * @param {Array} proxyList array of objects {url, encryptionKey} 
 * 
 * @returns {EventStream} responsesStream rx stream
 * @returns {EventStream} outputStream rx stream
 */
const connectToSPDZProxy = (userOptions, ...proxyList) => {

  // Merge user options with defaults.
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

  let connectionStreamList = []
  let resultStreamList = []
  let sharesStreamList = []
  let outputsStreamList = []

  for (const proxy of proxyList) {
    const [connectionStream, resultStream, sharesStream, outputsStream] = connectSetup(connectOptions, proxy.url, proxy.encryptionKey)
    connectionStreamList.push(connectionStream)    
    resultStreamList.push(resultStream)
    sharesStreamList.push(sharesStream)
    outputsStreamList.push(outputsStream)
  }

  // Combine connection events so that:
  // 1. wait until all proxies have replied with at least one event
  // 2. each time a proxy sends a connect/disconnect get a combined event of all latest proxy events.
  const combinedConnectionStream = Bacon.combineAsArray(connectionStreamList)

  // Combine each proxies rx stream with zip (meaning waits until all proxies send message).
  // Note errors are not combined, so each proxy error will be sent separately.
  const combinedResultsStream = Bacon.zipAsArray(resultStreamList)
  const combinedSharesStream = Bacon.zipAsArray(sharesStreamList)
  const combinedOutputsStream = Bacon.zipAsArray(outputsStreamList)

  // Convert arrays of binary buffers into array of Gfp shares
  const extractedSharesStream = combinedSharesStream.flatMap(extractValidateShares)

  // Convert arrays of binary buffers into array of numbers.
  const extractedOutputStream = combinedOutputsStream.flatMap(convertOutput)
 
  // Configure streams to send input to websocket
  const sendValueStream = setupSendInputStream(extractedSharesStream)

  // Capture errors to allow client to report / act on them.
  const errorsStream = Bacon.mergeAll(extractedSharesStream.errors(), extractedOutputStream.errors(), sendValueStream.errors())
  const errorsAsValueStream = errorsStream.flatMapError(v => {
    return [{ responseType: RESPONSE_TYPE.ERROR, success: false, msg: v }]
  })

  const processedResponsesStream = Bacon.mergeAll(combinedConnectionStream, combinedResultsStream, errorsAsValueStream).flatMap(value => processResponseMessage(value))

  return [processedResponsesStream, extractedOutputStream]
}

/**
 * Request a connection to all SPDZ engines.
 * @param {String} publicKey 256 bit public key as 64 byte hex string 
 * @param {boolean} reuseConnection if currently connected to SPDZ reuse the connection, or tear down and start again. 
 */
const connectToSpdz = (publicKey, reuseConnection) => {
  webSocketBus.push({
    eventType: 'connectToSpdz',
    publicKey: publicKey,
    reuseConnection: reuseConnection
  })
}

/**
 * Send input to SPDZ (currently integers only).
 * @param {Array<Number>} inputList Integers to send to SPDZ. 
 */
const sendInput = inputList => {
  userInputBus.push(inputList)
}

/**
 * Run web socket connection to SPDZ proxy for a specific SPDZ server.
 * 
 * @param {Object} connectOptions socket.io connection options 
 * @param {String} url SPDZ Proxy URL 
 * @param {String} encryptionKey session key agreed between client and SPDZ server. 
 *
 * @returns {connectionStream} websocket connection events in an rx stream 
 * @returns {resultStream} websocket spdz events in an rx stream 
 * @returns {sharesStream} raw byte shares in an rx stream
 * @returns {outputsStream} raw byte outputs in an rx stream
 */
const connectSetup = (connectOptions, url, encryptionKey) => {
  const socket = Io.connect(url, connectOptions)

  //***************************************
  // Wrap socket events in Bacon (reactive)
  //***************************************
  // Gather websocket connection messages from SPDZ Proxy into single stream 
  const connectionStream = Bacon.fromBinder(sink => {
    socket.on('connect', () => {
      sink({ responseType: RESPONSE_TYPE.PROXY_CONNECT, success: true, url: url, msg: 'SPDZ Proxy connection made.' })
    })

    socket.on('connect_error', () => {
      sink({ responseType: RESPONSE_TYPE.PROXY_CONNECT, success: false, url: url, msg: 'Connection error.' })
    })

    socket.on('connect_timeout', () => {
      sink({ responseType: RESPONSE_TYPE.PROXY_CONNECT, success: false, url: url, msg: 'Connection timeout.' })
    })
    
    //Used for unsubscribe tidy up
    return () => {}
  })

  // Gather result messages from SPDZ Proxy into single stream 
  const resultStream = Bacon.fromBinder(sink => {
    socket.on('connectToSpdz_result', (status, err) => {
      sink({ responseType: RESPONSE_TYPE.CONNECT_TO_SPDZ, success: (status === 0 ? true : false), url: url, msg: (status === 0 ? 'SPDZ connection made.' : err) })
    })

    socket.on('sendData_result', (status, err) => {
      sink({ responseType: RESPONSE_TYPE.SEND_INPUT, success: (status === 0 ? true : false), url: url, msg: (status === 0 ? 'Input sent to SPDZ.' : err) })
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
  
  webSocketBus.onValue(value => {
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

  return [connectionStream, resultStream, sharesStream, outputsStream]
}

module.exports = {
  connectToSPDZProxy: connectToSPDZProxy,
  connectToSpdz: connectToSpdz,
  sendInput: sendInput, 
  responseType : RESPONSE_TYPE
}
