// 시험에서만 쓰는 ZIP 읽기 (zip.test.ts, pptx.test.ts). 화면 코드는 이것을 쓰지 않는다.
import { inflateRawSync } from 'node:zlib'
import { crc32 } from './zip'

interface ReadEntry {
  name: string
  method: number
  flags: number
  crc: number
  data: Uint8Array
}

/**
 * 시험용 ZIP 읽기. 목록 끝 → 중앙 목록 → 로컬 머리 차례로 따라가며 서명, 크기, 자리, CRC가 서로 맞는지 본다.
 * 하나라도 어긋나면 던진다 (PowerPoint가 '복구'를 묻는 것과 같은 자리)
 */
export function readZip(bytes: Uint8Array): ReadEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  if (view.getUint32(end, true) !== 0x06054b50) throw new Error('no end record')
  const count = view.getUint16(end + 10, true)
  if (view.getUint16(end + 8, true) !== count) throw new Error('disk entry count')
  const cdSize = view.getUint32(end + 12, true)
  const cdAt = view.getUint32(end + 16, true)
  if (cdAt + cdSize !== end) throw new Error('central directory size')
  const out: ReadEntry[] = []
  let at = cdAt
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('central signature')
    const flags = view.getUint16(at + 8, true)
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const csize = view.getUint32(at + 20, true)
    const usize = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen

    if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`local signature: ${name}`)
    if (view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method) throw new Error(`local header: ${name}`)
    if (view.getUint32(local + 14, true) !== crc || view.getUint32(local + 18, true) !== csize || view.getUint32(local + 22, true) !== usize)
      throw new Error(`local sizes: ${name}`)
    const lname = view.getUint16(local + 26, true)
    const lextra = view.getUint16(local + 28, true)
    if (new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + lname)) !== name) throw new Error(`local name: ${name}`)
    const body = bytes.subarray(local + 30 + lname + lextra, local + 30 + lname + lextra + csize)
    const data = method === 8 ? new Uint8Array(inflateRawSync(body)) : method === 0 ? body : null
    if (!data) throw new Error(`method ${method}`)
    if (data.length !== usize) throw new Error(`size: ${name}`)
    if (crc32(data) !== crc) throw new Error(`crc: ${name}`)
    out.push({ name, method, flags, crc, data })
  }
  if (at !== end) throw new Error('central directory length')
  return out
}
