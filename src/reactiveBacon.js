/** Scratchpad for Bacon. */
const Bacon = require('baconjs').Bacon


const stream1 = Bacon.interval(1000, 2)

const propStatus = stream1.map(value => value > 1).toProperty()

const myFunc = () => {
  propStatus.onValue(v => {
    if (v) {
      console.log('do sthg')
    } else {
      throw new Error('cant do sthg')
    }
  })
}

setTimeout(() => myFunc(), 2000)



// const sendValueStream = stream1.zip(stream2).flatMap(inp => {
//   return new Bacon.Error('inp error', inp)
// })

// const sendValueStream = stream1.zip(stream2, (x,y) => {
//   return new Bacon.Error(`inp error ${[x,y]}`)
// })


// sendValueStream.onValue(inputList => {
//   console.log(`About to send ${inputList}.`)
// })

// sendValueStream.onError(err => {
//   console.log(`Error ${err}.`)
// })


// const stream1 = Bacon.fromArray([true])
// //const stream2 = Bacon.fromArray([false, false, true])
// const stream2 = Bacon.interval(10000, false)

// const prop1 = stream1.toProperty(false)
// const prop2 = stream2.toProperty(false)

// Bacon.combineAsArray([stream1, stream2]).onValue(v => console.log(v))

// const mapper = value => {
//   if (value <= 3) {
//     return value
//   } else {
//     return new Bacon.Error(`value ${value} > 3.`)
//   }
// }

// //example streams
// const stream1 = Bacon.fromArray([1,2,3,4]).flatMap(mapper)

// const stream2 = Bacon.fromArray([3.1,4.1,5.1]).flatMap(mapper)

// //extract and merge errors, convert to value
// const errStream = Bacon.mergeAll(stream1.errors(), stream2.errors())
// const errAsValueStream = errStream.flatMapError(v => {return {type: 'error', reason: v}})

// errAsValueStream.onValue(v => console.log(v))

