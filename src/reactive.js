const Rx = require('rxjs')

const source = Rx.Observable
  .interval(200)
  .take(9)
  .map(i => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'][i])

source.subscribe(x => console.log(x))
