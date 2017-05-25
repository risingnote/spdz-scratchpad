const Io = require('socket.Io-client')
const Bacon = require('baconjs').Bacon

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
  //***************************************
  const connectionStream = Bacon.fromBinder(sink => {
    socket.on('connect', () => {
      sink(1)
    })
    socket.on('connect_error', () => {
      sink(new Bacon.Error(`Connection error for ${url}.`))
    })
    socket.on('connect_timeout', () => {
      sink(new Bacon.Error(`Connection timeout for ${url}.`))
    })

    //Used for unsubscribe tidy up
    return () => {}
  })

  const messageStream = Bacon.fromBinder(sink => {
    socket.on('spdz_message', data => {
      sink(data)
    })

    //Used for unsubscribe tidy up
    return () => {}
  })

  publishBus.onValue(value => {
    socket.emit('public_key', value)
  })

  return [connectionStream, messageStream, publishBus]
}

// Used if autoConnect is false, Returns immediately
//const socket = socketManager.connect()

module.exports = {
  connectToSPDZProxy: connectToProxy,
  publishStream: publishBus
}
