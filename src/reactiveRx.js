const Rx = require('rxjs/Rx')

// Basic
// const source = Rx.Observable
//   .interval(200)
//   .take(9)
//   .map(i => [1, 2, 3, 4, 5, 6, 7, 8, 9][i])

// const result = source.reduce((x, y) => x + y)

// result.subscribe(x => console.log(x))

// Zip waits for multiple sequences to provide new values

const proxy1 = Rx.Observable.interval(400).first().map(i => ['a'][i])

const proxy2 = Rx.Observable.interval(150).first().map(i => ['A'][i])

const proxy3 = Rx.Observable.interval(1250).first().map(() => {
  throw new Error('no')
})

// Observable should end when zipped observables end.
const combined = Rx.Observable.zip(proxy1, proxy2, proxy3)

const observer = Rx.Subscriber.create(
  x => console.log(x),
  err => {
    console.log(`Got error ${err.message}.`)
  },
  () => {
    console.log('Completed')
  }
)

const subs = combined.subscribe(observer)

// Would run in unmount / end of function
// subs.unsubscribe()
