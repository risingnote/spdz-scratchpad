/**
 * Run a simple web socket server for testing interactions.
 */
'use strict'

const express = require('express')
const http = require('http')
const Io = require('socket.io')
const logger = require('./logging')
const port = process.env.PORT || '8080'

const app = express()

// Configure web server
const webServer = http.createServer(app)

// Setup server web socket
const io = new Io(webServer, { path: '/test/socket.io' })
const ns = io.of('/test')

const clientList = {}

ns.on('connection', socket => {
  logger.info(`Socket ${socket.id} connected.`)

  socket.on('public_key', data => {
    logger.info(
      `Got public key message with data ${data} from socket ${socket.id}.`
    )
    if (clientList.hasOwnProperty(data)) {
      //reconnection
      logger.info('Client has been here before.')
    } else {
      //new connection
      clientList[data] = data
      setTimeout(() => {
        socket.emit('spdz_message', '1234')
      }, 2000)
    }
  })

  socket.on('disconnect', () => {
    logger.info(`Socket ${socket.id} disconnected.`)
  })
})

webServer.listen(port, () => {
  logger.info(`Serving web socket server on port ${port}.`)
})
