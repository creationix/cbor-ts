const UNSIGNED_INTEGER = 0;
const NEGATIVE_INTEGER = 1;
const BYTE_STRING = 2;
const TEXT_STRING = 3;
const ARRAY = 4;
const MAP = 5;
const FLOAT_OR_PRIMITIVE = 7;
const FALSE = 20;
const TRUE = 21;
const NULL = 22;
const UNDEFINED = 23;
export function encode(rootValue) {
    const parts = [];
    let size = 0;
    encodeAny(rootValue);
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (let i = 0, l = parts.length; i < l; i++) {
        buffer.set(parts[i], offset);
        offset += parts[i].byteLength;
    }
    return buffer;
    function encodeAny(value) {
        if (typeof value === 'string') {
            return encodeString(value);
        }
        if (typeof value === 'number') {
            return encodeNumber(value);
        }
        if (typeof value === 'bigint') {
            return encodeBigInt(value);
        }
        if (value === null) {
            return pushHeader(FLOAT_OR_PRIMITIVE, NULL);
        }
        if (value === undefined) {
            return pushHeader(FLOAT_OR_PRIMITIVE, UNDEFINED);
        }
        if (typeof value === 'boolean') {
            return pushHeader(FLOAT_OR_PRIMITIVE, value ? TRUE : FALSE);
        }
        if (ArrayBuffer.isView(value)) {
            return encodeBytes(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        }
        if (Array.isArray(value)) {
            return encodeArray(value);
        }
        if (typeof value === 'object') {
            return encodeObject(value);
        }
        throw new Error(`Unsupported value type: ${typeof value}`);
    }
    function encodeString(str) {
        const utf8 = new TextEncoder().encode(str.normalize('NFC'));
        const len = utf8.byteLength;
        pushHeader(TEXT_STRING, len);
        parts.push(utf8);
        size += len;
    }
    function encodeBytes(bytes) {
        const len = bytes.byteLength;
        pushHeader(BYTE_STRING, len);
        parts.push(bytes);
        size += len;
    }
    function encodeNumber(num) {
        if (Number.isSafeInteger(num)) {
            if (num >= 0) {
                pushHeader(UNSIGNED_INTEGER, num);
            }
            else {
                pushHeader(NEGATIVE_INTEGER, -1 - num);
            }
            return;
        }
        const part = new Uint8Array(9);
        part[0] = (FLOAT_OR_PRIMITIVE << 5) | 27;
        new DataView(part.buffer).setFloat64(1, num);
        parts.push(part);
        size += 9;
    }
    function encodeBigInt(num) {
        if (Number.isSafeInteger(Number(num))) {
            return encodeNumber(Number(num));
        }
        if (num >= 0n) {
            if (num < 0x10000000000000000n) {
                const part = new Uint8Array(9);
                part[0] = (UNSIGNED_INTEGER << 5) | 27;
                new DataView(part.buffer).setBigUint64(1, num);
                parts.push(part);
                size += 9;
                return;
            }
        }
        else if (num >= -0x10000000000000000n) {
            const part = new Uint8Array(9);
            part[0] = (NEGATIVE_INTEGER << 5) | 27;
            new DataView(part.buffer).setBigUint64(1, -1n - num);
            parts.push(part);
            size += 9;
            return;
        }
        throw new Error('Bigint outside i65 range');
    }
    function encodeArray(arr) {
        const len = arr.length;
        pushHeader(ARRAY, len);
        for (let i = 0; i < len; i++) {
            encodeAny(arr[i]);
        }
    }
    function encodeObject(obj) {
        const entries = Object.entries(obj);
        const len = entries.length;
        pushHeader(MAP, len);
        for (let i = 0; i < len; i++) {
            const [key, value] = entries[i];
            encodeString(key);
            encodeAny(value);
        }
    }
    function pushHeader(major, minor) {
        if (minor < 24) {
            parts.push(new Uint8Array([(major << 5) | minor]));
            size += 1;
            return;
        }
        if (minor < 0x100) {
            parts.push(new Uint8Array([(major << 5) | 24, minor]));
            size += 2;
            return;
        }
        if (minor < 0x10000) {
            const part = new Uint8Array(3);
            part[0] = (major << 5) | 25;
            new DataView(part.buffer).setUint16(1, minor);
            parts.push(part);
            size += 3;
            return;
        }
        if (minor < 0x100000000) {
            const part = new Uint8Array(5);
            part[0] = (major << 5) | 26;
            new DataView(part.buffer).setUint32(1, minor);
            parts.push(part);
            size += 5;
            return;
        }
        const part = new Uint8Array(9);
        part[0] = (major << 5) | 27;
        new DataView(part.buffer).setBigUint64(1, BigInt(minor));
        parts.push(part);
        size += 9;
    }
}
export function decode(data) {
    let offset = 0;
    return parseValue();
    function parseValue() {
        const byte = data[offset++];
        const start = offset;
        const major = byte >> 5;
        let minor = byte & 0b00011111;
        if (minor === 24) {
            minor = data[offset++];
        }
        else if (minor === 25) {
            minor = new DataView(data.buffer, offset, 2).getUint16(0);
            offset += 2;
        }
        else if (minor === 26) {
            minor = new DataView(data.buffer, offset, 4).getUint32(0);
            offset += 4;
        }
        else if (minor === 27) {
            const value = new DataView(data.buffer, offset, 8).getBigUint64(0);
            offset += 8;
            if (!Number.isSafeInteger(Number(value))) {
                if (major === UNSIGNED_INTEGER) {
                    return value;
                }
                if (major === NEGATIVE_INTEGER) {
                    return -1n - value;
                }
                if (major === FLOAT_OR_PRIMITIVE) {
                    const buf = new Uint8Array(8);
                    new DataView(buf.buffer).setBigUint64(0, value);
                    return new DataView(buf.buffer).getFloat64(0);
                }
                throw new Error('Invalid major type for bigint');
            }
            minor = Number(value);
        }
        switch (major) {
            case UNSIGNED_INTEGER:
                return minor;
            case NEGATIVE_INTEGER:
                return -1 - minor;
            case BYTE_STRING:
                return data.subarray(offset, (offset += minor));
            case TEXT_STRING:
                return new TextDecoder().decode(data.subarray(offset, (offset += minor)));
            case ARRAY: {
                const arr = [];
                for (let i = 0; i < minor; i++) {
                    arr.push(parseValue());
                }
                return arr;
            }
            case MAP: {
                const obj = {};
                for (let i = 0; i < minor; i++) {
                    const key = parseValue();
                    const value = parseValue();
                    obj[String(key)] = value;
                }
                return obj;
            }
            case FLOAT_OR_PRIMITIVE:
                switch (minor) {
                    case FALSE:
                        return false;
                    case TRUE:
                        return true;
                    case NULL:
                        return null;
                    case UNDEFINED:
                        return undefined;
                    default: {
                        const size = offset - start;
                        if (size === 8) {
                            return new DataView(data.buffer, start, 8).getFloat64(0);
                        }
                        if (size === 4) {
                            return new DataView(data.buffer, start, 4).getFloat32(0);
                        }
                        if (size === 2) {
                            return decodeHalfPrecision(new DataView(data.buffer, start, 2).getUint16(0));
                        }
                        throw new Error(`Invalid size for float: ${size}`);
                    }
                }
            default:
                throw new Error(`Invalid major type: ${major}`);
        }
    }
}
function decodeHalfPrecision(half) {
    const exp = (half >> 10) & 0x1f;
    const mant = half & 0x3ff;
    let val;
    if (exp === 0) {
        val = ldexp(mant, -24);
    }
    else if (exp !== 31) {
        val = ldexp(mant + 1024, exp - 25);
    }
    else {
        val = mant === 0 ? Infinity : NaN;
    }
    return half & 0x8000 ? -val : val;
}
function ldexp(mant, exp) {
    return mant * 2 ** exp;
}
