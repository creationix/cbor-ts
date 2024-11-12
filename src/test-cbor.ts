import { encode, decode } from './cbor.ts'

const encodeTests = [
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

const decodeTests = [
  ['00', 0], // Unsigned integer
  ['01', 1], // Unsigned integer
  ['0a', 10], // Unsigned integer
  ['17', 23], // Unsigned integer
  ['1818', 24], // Unsigned integer
  ['1819', 25], // Unsigned integer
  ['1864', 100], // Unsigned integer
  ['1903e8', 1000], // Unsigned integer
  ['1a000f4240', 1000000], // Unsigned integer
  ['1b000000e8d4a51000', 1000000000000], // Unsigned integer
  ['1bffffffffffffffff', 18446744073709551615n], // Unsigned integer
  ['3bffffffffffffffff', -18446744073709551616n], // Negative integer
  ['20', -1], // Negative integer
  ['29', -10], // Negative integer
  ['3863', -100], // Negative integer
  ['3903e7', -1000], // Negative integer
  ['f90000', 0], // Float
  ['f98000', -0], // Float
  ['f93c00', 1], // Float
  ['fb3ff199999999999a', 1.1], // Float
  ['f93e00', 1.5], // Float
  ['f97bff', 65504], // Float
  ['fa47c35000', 100000], // Float
  ['fa7f7fffff', 3.4028234663852886e38], // Float
  ['fb7e37e43c8800759c', 1.0e300], // Float
  ['f90001', 5.960464477539063e-8], // Float
  ['f90400', 0.00006103515625], // Float
  ['f9c400', -4], // Float
  ['fbc010666666666666', -4.1], // Float
  ['f97c00', Infinity], // Float
  ['f97e00', NaN], // Float
  ['f9fc00', -Infinity], // Float
  ['fa7f800000', Infinity], // Float
  ['fa7fc00000', NaN], // Float
  ['faff800000', -Infinity], // Float
  ['fb7ff0000000000000', Infinity], // Float
  ['fb7ff8000000000000', NaN], // Float
  ['fbfff0000000000000', -Infinity], // Float
  ['fb400921fb54442d18', Math.PI], // Float
  ['fb4005bf0a8b145769', Math.E], // Float
  ['f4', false], // False
  ['f5', true], // True
  ['f6', null], // Null
  ['f7', undefined], // Undefined
  ['40', hex``], // Empty byte string
  ['4401020304', hex`01020304`], // Byte string
  ['60', ''], // String
  ['6161', 'a'], // String
  ['6449455446', 'IETF'], // String
  ['62225c', '"\\'], // String
  ['62c3bc', '\u00fc'], // String
  ['63e6b0b4', '\u6c34'], // String
  ['64f0908591', '\ud800\udd51'], // String
  ['80', []], // Empty array
  ['83010203', [1, 2, 3]], // Array
  ['8301820203820405', [1, [2, 3], [4, 5]]], // Array
  ['a0', {}], // Empty map
  ['a26161016162820203', { a: 1, b: [2, 3] }], // Array in Map
  ['826161a161626163', ['a', { b: 'c' }]], // Map in Array
  ['a56161614161626142616361436164614461656145', { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E' }], // Map
]

let failed = 0

console.log('\nRunning encoder tests:\n')
for (const [input, expected] of encodeTests) {
  const actual = Buffer.from(encode(input)).toString('hex')
  if (actual !== expected) {
    console.log({ input, expect: expected, actual })
    failed++
  }
}

console.log('\nRunning decoder tests:\n')
for (const [input, expected] of decodeTests) {
  let actual: unknown
  try {
    actual = decode(Uint8Array.from(Buffer.from(input, 'hex')))
  } catch (e) {
    actual = e.message
  }
  if (!sameShape(actual, expected)) {
    // biome-ignore lint/suspicious/noConsoleLog: <explanation>
    console.log({ input, expect: expected, actual })
    failed++
  }
}

if (failed > 0) {
  throw new Error(`${failed} tests failed!`)
}

// Helper function to create byte strings from hex strings.
// Make sure to not actually interpolate any variables into the template string.
function hex([str]: TemplateStringsArray): Uint8Array {
  return new Uint8Array(str.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)))
}

function sameShape(a: unknown, b: unknown): boolean {
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) {
    return true
  }
  if (!(a && b)) {
    return false
  }
  if (typeof a !== typeof b) {
    return false
  }
  if (typeof a !== 'object' || typeof b !== 'object') {
    return false
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false
    }
    for (let i = 0, l = a.length; i < l; i++) {
      if (!sameShape(a[i], b[i])) {
        return false
      }
    }
    return true
  }
  return sameShape(Object.entries(a), Object.entries(b))
}
