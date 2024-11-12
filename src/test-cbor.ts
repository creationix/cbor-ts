import { encode, decode } from './cbor.ts'

// Helper function to create byte strings from hex strings.
// Make sure to not actually interpolate any variables into the template string.
function hex([str]: TemplateStringsArray): Uint8Array {
  return new Uint8Array(str.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)))
}

const tests = [
  [0, '00'], // Unsigned integer
  [1, '01'], // Unsigned integer
  [10, '0a'], // Unsigned integer
  [23, '17'], // Unsigned integer
  [24, '1818'], // Unsigned integer
  [25, '1819'], // Unsigned integer
  [100, '1864'], // Unsigned integer
  [1000, '1903e8'], // Unsigned integer
  [1000000, '1a000f4240'], // Unsigned integer
  [1000000000000, '1b000000e8d4a51000'], // Unsigned integer
  [18446744073709551615n, '1bffffffffffffffff'], // Unsigned integer
  [-18446744073709551616n, '3bffffffffffffffff'], // Negative integer
  [-1, '20'], // Negative integer
  [-10, '29'], // Negative integer
  [-100, '3863'], // Negative integer
  [-1000, '3903e7'], // Negative integer
  [1.1, 'fb3ff199999999999a'], // Float
  [1.0e300, 'fb7e37e43c8800759c'], // Float
  [Math.PI, 'fb400921fb54442d18'], // Float
  [Math.E, 'fb4005bf0a8b145769'], // Float
  [false, 'f4'], // False
  [true, 'f5'], // True
  [null, 'f6'], // Null
  [undefined, 'f7'], // Undefined
  [hex``, '40'], // Empty byte string
  [hex`01020304`, '4401020304'], // Byte string
  ['', '60'], // String
  ['a', '6161'], // String
  ['IETF', '6449455446'], // String
  ['"\\', '62225c'], // String
  ['\u00fc', '62c3bc'], // String
  ['\u6c34', '63e6b0b4'], // String
  ['\ud800\udd51', '64f0908591'], // String
  [[], '80'], // Empty array
  [[1, 2, 3], '83010203'], // Array
  [[1, [2, 3], [4, 5]], '8301820203820405'], // Array
  [{}, 'a0'], // Empty map
  [{ a: 1, b: [2, 3] }, 'a26161016162820203'], // Array in Map
  [['a', { b: 'c' }], '826161a161626163'], // Map in Array
  [{ a: 'A', b: 'B', c: 'C', d: 'D', e: 'E' }, 'a56161614161626142616361436164614461656145'], // Map
]

for (const [input, expected] of tests) {
  const actual = Buffer.from(encode(input)).toString('hex')
  console.log(actual === expected, actual)
}
