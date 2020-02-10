import {AppSegmentParserBase} from '../parser.js'
import {segmentParsers} from '../plugins.js'
import {customError} from '../util/helpers.js'


const PROFILE_HEADER_LENGTH = 84

const TAG_TYPE_DESC = 'desc'
const TAG_TYPE_MLUC = 'mluc'
const TAG_TYPE_TEXT = 'text'
const TAG_TYPE_SIG  = 'sig '
// TODO: other types 'mft2', 'XYZ '

const EMPTY_VALUE = '\x00\x00\x00\x00'

export default class IccParser extends AppSegmentParserBase {

	static type = 'icc'
	static headerLength = 18

	static canHandle(chunk, offset) {
		return chunk.getUint8(offset + 1) === 0xE2
			&& chunk.getUint32(offset + 4) === 0x4943435f // ICC_
			// ICC_PROFILE
	}

	static findPosition(chunk, offset) {
		let seg = super.findPosition(chunk, offset)
		seg.chunkNumber  = chunk.getUint8(offset + 16)
		seg.chunkCount   = chunk.getUint8(offset + 17)
		seg.multiSegment = seg.chunkCount > 1
		return seg
	}

	parse() {
		this.raw = new Map
		this.parseHeader()
		this.parseTags()
		this.translate()
		return this.output
	}

	parseHeader() {
		let {raw} = this
		if (this.chunk.byteLength < PROFILE_HEADER_LENGTH)
			throw customError('ICC header is too short')
		for (let [offset, parse] of Object.entries(headerParsers)) {
			offset = parseInt(offset, 10)
			let val = parse(this.chunk, offset)
			if (val === EMPTY_VALUE) continue
			raw.set(offset, val)
		}
	}

	parseTags() {
		let {raw} = this
		let tagCount = this.chunk.getUint32(128)
		let offset = 132
		let chunkLength = this.chunk.byteLength
		let code, valueOffset, valueLength, type, value
		while (tagCount--) {
			code        = this.chunk.getString(offset, 4)
			valueOffset = this.chunk.getUint32(offset + 4)
			valueLength = this.chunk.getUint32(offset + 8)
			type        = this.chunk.getString(valueOffset, 4)
			if (valueOffset + valueLength > chunkLength) {
				console.warn('reached the end of the first ICC chunk. Enable options.tiff.multiSegment to read all ICC segments.')
				return
			}
			value = this.parseTag(type, valueOffset, valueLength)
			// Not all the type parsers are implemented.
			if (value !== undefined && value !== EMPTY_VALUE)
				raw.set(code, value)
			offset += 12
		}
	}

	parseTag(type, offset, length) {
		switch (type) {
			case TAG_TYPE_DESC: return this.parseDesc(offset)
			case TAG_TYPE_MLUC: return this.parseMluc(offset)
			case TAG_TYPE_TEXT: return this.parseText(offset, length)
			case TAG_TYPE_SIG:  return this.parseSig(offset)
			// TODO: implement more types
		}
		if (offset + length > this.chunk.byteLength) {
			// TODO: handle these when multi-segment ICC is being implemented
			// look out for issue-metadata-extractor-65.jpg
		} else {
			return this.chunk.getUint8Array(offset, length)
		}
	}

	parseDesc(offset) {
		let length  = this.chunk.getUint32(offset + 8) - 1 // last byte is null termination
		return this.chunk.getString(offset + 12, length).trim()
	}

	parseText(offset, length) {
		return this.chunk.getString(offset + 8, length - 15).trim()
	}

	// NOTE: some tags end with empty space. TODO: investigate. maybe add .trim() 
	parseSig(offset) {
		return this.chunk.getString(offset + 8, 4).trim()
	}

	// Multi Localized Unicode Type
	parseMluc(tagOffset) {
		let {chunk} = this
		let entryCount  = chunk.getUint32(tagOffset + 8)
		let entrySize   = chunk.getUint32(tagOffset + 12)
		let entryOffset = tagOffset + 16
		let values      = []
		for (let i = 0; i < entryCount; i++) {
			let lang    = chunk.getString(entryOffset + 0, 2)
			let country = chunk.getString(entryOffset + 2, 2)
			let length  = chunk.getUint32(entryOffset + 4)
			let offset  = chunk.getUint32(entryOffset + 8) + tagOffset
			let text = sanitizeTermination(chunk.getUnicodeString(offset, length))
			values.push({lang, country, text})
			entryOffset += entrySize
		}
		if (entryCount === 1)
			return values[0].text
		else
			return values
	}

	translateValue(val, tagEnum) {
		if (typeof val === 'string')
			return tagEnum[val] || tagEnum[val.toLowerCase()] || val
		else
			return tagEnum[val] || val
	}

}

const headerParsers = {
	4: parseString,
	8: parseVersion,
	12: parseString,
	16: parseString,
	20: parseString,
	24: parseDate,
	36: parseString,
	40: parseString,
	48: parseString,
	52: parseString,
	64: (view, offset) => view.getUint32(offset),
	80: parseString
}

function parseString(view, offset) {
	return view.getString(offset, 4).trim()
}

function parseVersion(view, offset) {
	return [
		view.getUint8(offset),
		view.getUint8(offset + 1) >> 4,
		view.getUint8(offset + 1) % 16,
	]
	.map(num => num.toString(10))
	.join('.')
}

function parseDate(view, offset) {
	const year    = view.getUint16(offset)
	const month   = view.getUint16(offset + 2) - 1
	const day     = view.getUint16(offset + 4)
	const hours   = view.getUint16(offset + 6)
	const minutes = view.getUint16(offset + 8)
	const seconds = view.getUint16(offset + 10)
	return new Date(Date.UTC(year, month, day, hours, minutes, seconds))
}

function sanitizeTermination(string) {
	while (string.endsWith('\0'))
		string = string.slice(0, -1)
	return string
}

segmentParsers.set('icc', IccParser)