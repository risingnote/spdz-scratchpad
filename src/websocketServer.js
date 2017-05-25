/**
 * Run a simple web socket server for testing interactions.
 */
'use strict'

const express = require('express')
const http = require('http')
const Io = require('socket.io')
const logger = require('./logging')

const app = express()

// Configure web server
const webServer = http.createServer(app)

// Setup server web socket
const io = new Io(webServer, { path: '/test/socket.io' })
const ns = io.of('/test')

ns.on('connection', socket => {
  logger.info(`Socket ${socket.id} connected.`)

  socket.on('public_key', data => {
    logger.info(
      `Got public key message with data ${data} from socket ${socket.id}.`
    )

    setTimeout(() => {
      socket.emit('spdz_message', '1234')
    }, 2000)
  })

  socket.on('disconnect', () => {
    logger.info(`Socket ${socket.id} disconnected.`)
  })
})

webServer.listen(8080, () => {
  logger.info('Serving web socket server on port 8080.')
})
