import * as platform from './util/platform.js'
import {BufferView} from './util/BufferView.js'
import {customError} from './util/helpers.js'
import {fileReaders} from './plugins.js'


// TODO: - API for including 3rd party XML parser

export function read(arg, options) {
	if (typeof arg === 'string')
		return readString(arg, options)
	else if (platform.browser && !platform.worker && arg instanceof HTMLImageElement)
		return readString(arg.src, options)
	else if (arg instanceof Uint8Array || arg instanceof ArrayBuffer || arg instanceof DataView)
		return new BufferView(arg)
	else if (platform.browser && arg instanceof Blob)
		return useReader(arg, options, 'blob', readBlobAsArrayBuffer)
	else
		throw customError('Invalid input argument')
}

function readString(arg, options) {
	if (isBase64Url(arg))
		return useReaderClass(arg, options, 'base64')
	else if (platform.browser)
		return useReader(arg, options, 'url', fetchUrlAsArrayBuffer)
	else if (platform.node)
		return useReaderClass(arg, options, 'fs')
	else
		throw customError('Invalid input argument')
}

async function useReader(url, options, readerName, readerFn) {
	if (fileReaders.has(readerName))
		return useReaderClass(url, options, readerName)
	else if (readerFn)
		return useReaderFunction(url, readerFn)
	else
		throw customError(`Parser ${readerName} is not loaded`)
}

async function useReaderClass(input, options, readerName) {
	let Reader = fileReaders.get(readerName)
	let file = new Reader(input, options)
	await file.read()
	return file
}

async function useReaderFunction(input, readerFn) {
	let rawData = await readerFn(input)
	return new DataView(rawData)
}

// FALLBACK FULL-FILE READERS (when ChunkedReader and the classes aren't available)

export async function fetchUrlAsArrayBuffer(url) {
	return fetch(url).then(res => res.arrayBuffer())
}

export async function readBlobAsArrayBuffer(blob) {
	return new Promise((resolve, reject) => {
		let reader = new FileReader()
		reader.onloadend = () => resolve(reader.result || new ArrayBuffer)
		reader.onerror = reject
		reader.readAsArrayBuffer(blob)
	})
}

// HELPER FUNCTIONS

function isBase64Url(string) {
	return string.startsWith('data:')
		|| string.length > 10000 // naive
}