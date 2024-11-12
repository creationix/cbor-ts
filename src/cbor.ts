// CBOR major types:
const UNSIGNED_INTEGER = 0
const NEGATIVE_INTEGER = 1
const BYTE_STRING = 2
const TEXT_STRING = 3
const ARRAY = 4
const MAP = 5
const FLOAT_OR_PRIMITIVE = 7

// CBOR primitive values:
const FALSE = 20
const TRUE = 21
const NULL = 22
const UNDEFINED = 23

const sharedBuffer = new Uint8Array(1024 * 1024 * 4)
export function encode(rootValue: unknown): Uint8Array {
  let buffer = sharedBuffer
  let size = 0

  encodeAny(rootValue)

  // Returned a cleaned up buffer
  return buffer === sharedBuffer ? buffer.slice(0, size) : buffer.subarray(0, size)

  function encodeAny(value: unknown) {
    if (typeof value === 'string') {
      return encodeString(value)
    }
    if (typeof value === 'number') {
      return encodeNumber(value)
    }
    if (typeof value === 'bigint') {
      return encodeBigInt(value)
    }
    if (value === null) {
      return pushHeader(FLOAT_OR_PRIMITIVE, NULL)
    }
    if (value === undefined) {
      return pushHeader(FLOAT_OR_PRIMITIVE, UNDEFINED)
    }
    if (typeof value === 'boolean') {
      return pushHeader(FLOAT_OR_PRIMITIVE, value ? TRUE : FALSE)
    }
    if (ArrayBuffer.isView(value)) {
      return encodeBytes(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    }
    if (Array.isArray(value)) {
      return encodeArray(value)
    }
    if (typeof value === 'object') {
      return encodeObject(value)
    }
    throw new Error(`Unsupported value type: ${typeof value}`)
  }

  function encodeString(str: string) {
    const utf8 = new TextEncoder().encode(str.normalize('NFC'))
    const len = utf8.byteLength
    pushHeader(TEXT_STRING, len)
    pushBytes(utf8)
  }

  function encodeBytes(bytes: Uint8Array) {
    const len = bytes.byteLength
    pushHeader(BYTE_STRING, len)
    pushBytes(bytes)
  }

  function encodeNumber(num: number) {
    if (Number.isSafeInteger(num)) {
      if (num >= 0) {
        pushHeader(UNSIGNED_INTEGER, num)
      } else {
        pushHeader(NEGATIVE_INTEGER, -1 - num)
      }
      return
    }
    const part = new Uint8Array(9)
    part[0] = (FLOAT_OR_PRIMITIVE << 5) | 27
    new DataView(part.buffer).setFloat64(1, num)
    pushBytes(part)
  }

  function encodeBigInt(num: bigint) {
    if (Number.isSafeInteger(Number(num))) {
      return encodeNumber(Number(num))
    }
    if (num >= 0n) {
      if (num < 0x10000000000000000n) {
        const part = new Uint8Array(9)
        part[0] = (UNSIGNED_INTEGER << 5) | 27
        new DataView(part.buffer).setBigUint64(1, num)
        pushBytes(part)
        return
      }
    } else if (num >= -0x10000000000000000n) {
      const part = new Uint8Array(9)
      part[0] = (NEGATIVE_INTEGER << 5) | 27
      new DataView(part.buffer).setBigUint64(1, -1n - num)
      pushBytes(part)
      return
    }
    throw new Error('Bigint outside i65 range')
  }

  function encodeArray(arr: unknown[]) {
    const len = arr.length
    pushHeader(ARRAY, len)
    for (let i = 0; i < len; i++) {
      encodeAny(arr[i])
    }
  }

  function encodeObject(obj: object) {
    const entries = Object.entries(obj)
    const len = entries.length
    pushHeader(MAP, len)
    for (let i = 0; i < len; i++) {
      const [key, value] = entries[i]
      encodeString(key)
      encodeAny(value)
    }
  }

  function pushHeader(major: number, minor: number) {
    if (minor < 24) {
      ensure(1)
      buffer[size++] = (major << 5) | minor
      return
    }
    if (minor < 0x100) {
      ensure(2)
      buffer[size++] = (major << 5) | 24
      buffer[size++] = minor
      return
    }
    if (minor < 0x10000) {
      ensure(3)
      buffer[size++] = (major << 5) | 25
      new DataView(buffer.buffer).setUint16(size, minor)
      size += 2
      return
    }
    if (minor < 0x100000000) {
      ensure(5)
      buffer[size++] = (major << 5) | 26
      new DataView(buffer.buffer).setUint32(size, minor)
      size += 4
      return
    }
    ensure(9)
    buffer[size++] = (major << 5) | 27
    new DataView(buffer.buffer).setBigUint64(size, BigInt(minor))
    size += 8
  }

  function ensure(needed: number) {
    if (size + needed > buffer.byteLength) {
      const newBuffer = new Uint8Array(Math.max(size + needed, buffer.byteLength * 2))
      newBuffer.set(buffer)
      buffer = newBuffer
    }
  }

  function pushBytes(bytes: Uint8Array) {
    const len = bytes.byteLength
    ensure(len)
    buffer.set(bytes, size)
    size += len
  }
}

export function decode(data: Uint8Array): unknown {
  let offset = 0
  return parseValue()

  function parseValue() {
    const byte = data[offset++]
    const start = offset
    const major = byte >> 5
    let minor: number = byte & 0b00011111
    if (minor === 24) {
      minor = data[offset++]
    } else if (minor === 25) {
      minor = new DataView(data.buffer, offset, 2).getUint16(0)
      offset += 2
    } else if (minor === 26) {
      minor = new DataView(data.buffer, offset, 4).getUint32(0)
      offset += 4
    } else if (minor === 27) {
      const value = new DataView(data.buffer, offset, 8).getBigUint64(0)
      offset += 8

      if (!Number.isSafeInteger(Number(value))) {
        if (major === UNSIGNED_INTEGER) {
          return value
        }
        if (major === NEGATIVE_INTEGER) {
          return -1n - value
        }
        if (major === FLOAT_OR_PRIMITIVE) {
          const buf = new Uint8Array(8)
          new DataView(buf.buffer).setBigUint64(0, value)
          return new DataView(buf.buffer).getFloat64(0)
        }
        throw new Error('Invalid major type for bigint')
      }

      minor = Number(value)
    }

    switch (major) {
      case UNSIGNED_INTEGER:
        return minor
      case NEGATIVE_INTEGER:
        return -1 - minor
      case BYTE_STRING:
        // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
        return data.subarray(offset, (offset += minor))
      case TEXT_STRING:
        // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
        return new TextDecoder().decode(data.subarray(offset, (offset += minor)))
      case ARRAY: {
        const arr: unknown[] = []
        for (let i = 0; i < minor; i++) {
          arr.push(parseValue())
        }
        return arr
      }
      case MAP: {
        const obj: Record<string, unknown> = {}
        for (let i = 0; i < minor; i++) {
          const key = parseValue()
          const value = parseValue()
          obj[String(key)] = value
        }
        return obj
      }
      case FLOAT_OR_PRIMITIVE:
        switch (minor) {
          case FALSE:
            return false
          case TRUE:
            return true
          case NULL:
            return null
          case UNDEFINED:
            return undefined
          default: {
            const size = offset - start
            // Double Precision
            if (size === 8) {
              return new DataView(data.buffer, start, 8).getFloat64(0)
            }
            // Single Precision
            if (size === 4) {
              return new DataView(data.buffer, start, 4).getFloat32(0)
            }
            // Half Precision
            if (size === 2) {
              return decodeHalfPrecision(new DataView(data.buffer, start, 2).getUint16(0))
            }
            throw new Error(`Invalid size for float: ${size}`)
          }
        }
      default:
        throw new Error(`Invalid major type: ${major}`)
    }
  }
}

function decodeHalfPrecision(half: number) {
  const exp = (half >> 10) & 0x1f
  const mant = half & 0x3ff
  let val: number
  if (exp === 0) {
    val = ldexp(mant, -24)
  } else if (exp !== 31) {
    val = ldexp(mant + 1024, exp - 25)
  } else {
    val = mant === 0 ? Infinity : NaN
  }
  return half & 0x8000 ? -val : val
}

function ldexp(mant: number, exp: number) {
  return mant * 2 ** exp
}
