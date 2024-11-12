# CBOR-TS

A compact implementation of basic CBOR in TS

## CBOR Spec

https://datatracker.ietf.org/doc/html/rfc7049

This only implements a commonly used subset of the spec to keep code size as small as possible.

- string (encoded as NFC normalized UTF-8)
- number (safe integers and full precision floats)
- boolean, null, undefined
- array
- object (keys are assumed to be strings)
- bigint (within the i65 range)
- Uint8Array (though the encoder will accept any ArrayBufferView)

## Usage

Simply use the `encode` / `decode` functions.

```js
import { encode, decode } from "cbor-ts"

const encoded = encode({ hello: "World" })
// `encoded` is a Uint8Array

const decoded = decode(encoded)
// `decoded` is { hello: "World" }
```