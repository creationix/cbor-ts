import { encode, decode } from './cbor.ts'

// Benchmark a huge document encoding and decoding
const huge = Array.from({ length: 10000 }, () => ({
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  e: 'E',
  f: [1, 2, 3, 4, 5],
  g: { h: 'H', i: 'I', j: 'J', k: 'K', l: 'L' },
  m: 1000000,
  n: 18446744073709551615n,
  o: -18446744073709551616n,
  p: 1.1,
  q: 1.0e300,
  r: Math.PI,
  s: Math.E,
  t: true,
  u: false,
  v: null,
  w: undefined,
  x: new Uint8Array([1, 2, 3, 4, 5]),
  y: '',
  z: 'IETF',
}))

for (let i = 0; i < 100; i++) {
  console.time('huge')
  const encoded = encode(huge)
  console.timeEnd('huge')

  console.log(encoded.byteLength)

  console.time('huge')
  const decoded = decode(encoded)
  console.timeEnd('huge')
}

/*

old version with `parts` array:

[162.17ms] huge
1550003
[63.84ms] huge

new version with `sharedBuffer`:

[57.27ms] huge
1550003
[63.75ms] huge

*/
