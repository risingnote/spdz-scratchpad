const Io = require('socket.Io-client')
const logger = require('./logging')

const socketManager = Io.connect('http://localhost:8080/test', {
  path: '/test/socket.io',
  reconnection: true,
  reconnectionAttempts: 30,
  timeout: 5000,
  autConnect: false
})

const socket = socketManager.connect()

socket.on('connect', () => {
  logger.info('connected with socket ', socket.id)

  socket.emit('public_key', '01020304050607')
})

socket.on('connect_error', () => {
  logger.info('Got connection error')
})

socket.on('connect_timeout', () => {
  logger.info('Got connection timeout')
})

socket.on('spdz_message', data => {
  logger.info(`Got spdz message with data ${data}.`)
})
