# CBOR-TS

A compact implementation of basic CBOR in TS

## CBOR Spec

https://datatracker.ietf.org/doc/html/rfc7049

This only implements a commonly used subset of the spec to keep code size as small as possible.

- string (encoded as NFC normalized UTF-8)
- integers (safe integers and bigints within the i65 range)
- floats (encodes as double-precision, decodes half-, single-, and double- precision)
- primitives (`true`, `false`, `null`, `undefined`)
- arrays
- objects (keys are assumed to be strings)
- bytes (encodes any `ArrayBufferView`, decodes as `Uint8Array`)

## Usage

Simply use the `encode` / `decode` functions.

```js
import { encode, decode } from "@creationix/cbor-ts"

const encoded = encode({ hello: "World" })
// `encoded` is a Uint8Array

const decoded = decode(encoded)
// `decoded` is { hello: "World" }
```