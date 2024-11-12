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

export function encode(rootValue: unknown): Uint8Array {
  const parts: Uint8Array[] = []
  let size = 0

  encodeAny(rootValue)

  // Combine the parts and return as a single buffer.
  const buffer = new Uint8Array(size)
  let offset = 0
  for (let i = 0, l = parts.length; i < l; i++) {
    buffer.set(parts[i], offset)
    offset += parts[i].byteLength
  }
  return buffer

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
    parts.push(utf8)
    size += len
  }

  function encodeBytes(bytes: Uint8Array) {
    const len = bytes.byteLength
    pushHeader(BYTE_STRING, len)
    parts.push(bytes)
    size += len
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
    parts.push(part)
    size += 9
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
        parts.push(part)
        size += 9
        return
      }
    } else if (num >= -0x10000000000000000n) {
      const part = new Uint8Array(9)
      part[0] = (NEGATIVE_INTEGER << 5) | 27
      new DataView(part.buffer).setBigUint64(1, -1n - num)
      parts.push(part)
      size += 9
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
      parts.push(new Uint8Array([(major << 5) | minor]))
      size += 1
      return
    }
    if (minor < 0x100) {
      parts.push(new Uint8Array([(major << 5) | 24, minor]))
      size += 2
      return
    }
    if (minor < 0x10000) {
      const part = new Uint8Array(3)
      part[0] = (major << 5) | 25
      new DataView(part.buffer).setUint16(1, minor)
      parts.push(part)
      size += 3
      return
    }
    if (minor < 0x100000000) {
      const part = new Uint8Array(5)
      part[0] = (major << 5) | 26
      new DataView(part.buffer).setUint32(1, minor)
      parts.push(part)
      size += 5
      return
    }
    const part = new Uint8Array(9)
    part[0] = (major << 5) | 27
    new DataView(part.buffer).setBigUint64(1, BigInt(minor))
    parts.push(part)
    size += 9
  }
}

export function decode(data: Uint8Array): unknown {
  let offset = 0
  return parseValue()

  function parseValue() {
    const byte = data[offset++]
    const major = byte >> 5
    const minor = byte & 0b00011111
    if (minor < 24) {
      return decodeValue(major, minor)
    }
    if (minor === 24) {
      return decodeValue(major, data[offset++])
    }
    if (minor === 25) {
      const value = new DataView(data.buffer, offset, 2).getUint16(0)
      offset += 2
      return decodeValue(major, value)
    }
    if (minor === 26) {
      const value = new DataView(data.buffer, offset, 4).getUint32(0)
      offset += 4
      return decodeValue(major, value)
    }
    if (minor === 27) {
      const value = new DataView(data.buffer, offset, 8).getBigUint64(0)
      offset += 8
      return decodeValue(major, value)
    }
  }

  function decodeValue(major: number, minor: number | bigint) {
    if (typeof minor === 'bigint') {
      if (Number.isSafeInteger(Number(minor))) {
        minor = Number(minor)
      }
    }
    if (typeof minor === 'bigint') {
      if (major === UNSIGNED_INTEGER) {
        return minor
      }
      if (major === NEGATIVE_INTEGER) {
        return -1n - minor
      }
      throw new Error('Invalid major type for bigint')
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
          default:
            return new DataView(data.buffer, offset - 1, 8).getFloat64(0)
        }
      default:
        throw new Error(`Invalid major type: ${major}`)
    }
  }
}
