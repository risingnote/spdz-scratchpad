const Io = require('socket.Io-client')
const Bacon = require('baconjs').Bacon
const logger = require('./logging')

const publishBus = Bacon.Bus()

const connectToProxy = (userOptions, ...urlList) => {
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
  let messagesStreamList = []

  for (const url of urlList) {
    const [connectionStream, messageStream] = connectSetup(connectOptions, url)
    connectionsStreamList.push(connectionStream)
    messagesStreamList.push(messageStream)
  }

  const combinedConnectionStream = Bacon.zipAsArray(connectionsStreamList)
  const combinedMessageStream = Bacon.zipAsArray(messagesStreamList)

  return [combinedConnectionStream, combinedMessageStream]
}

const connectSetup = (connectOptions, url) => {
  const socket = Io.connect(url, connectOptions)

  //***************************************
  // Wrap socket events in Bacon (reactive)
  // TODO Look at using Bacon.fromEvent instead of custom stream.
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

  const messageStream = Bacon.fromBinder(sink => {
    //TODO decrypt (all encrypted), split input vs results messages into 2 streams.
    socket.on('spdz_message', data => {
      sink(data)
    })

    socket.on('connectToSpdz_result', (status, err) => {
      sink({ status: status, err: err })
    })

    //Used for unsubscribe tidy up
    return () => {}
  })

  publishBus.onValue(value => {
    if (value.eventType === 'connectToSpdz') {
      socket.emit(
        value.eventType,
        value.publicKey,
        value.reuseConnection,
        (status, err) => {
          logger.info(`connectToSpdz ${url} status ${status} err ${err}`)
        }
      )
    } else {
      logger.warn(`Don't know what to do with event type ${value.eventType}`)
    }
  })

  return [connectionStream, messageStream, publishBus]
}

// Used if autoConnect is false, Returns immediately
//const socket = socketManager.connect()

module.exports = {
  connectToSPDZProxy: connectToProxy,
  publishStream: publishBus
}
