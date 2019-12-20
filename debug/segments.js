// node --experimental-modules enumerate-segments.js
import Exifr from '../src/index-full.js'
import {promises as fs} from 'fs'
import path from 'path'

const options = {
	wholeFile: true,
	mergeOutput: false,
	tiff: true,
	jfif: true,
	xmp: true,
	icc: true,
	iptc: true,
}

;(async function() {
	let allFiles = await fs.readdir('../test/fixtures/')
	//let imageFiles = allFiles.filter(name => name.endsWith('.jpg') || name.endsWith('.tiff') || name.endsWith('.tif'))
	let imageFiles = allFiles.filter(name => name.endsWith('.jpg'))
	for (let fileName of imageFiles) {
		let filePath = path.join('../test/fixtures/', fileName)
		let fileBuffer = await fs.readFile(filePath)
		let exifr = new Exifr(options)
		await exifr.read(fileBuffer)
		exifr.parse()
		console.log('----------------------------------------------------')
		console.log(fileName, kb(fileBuffer.length))
		let segments = [...exifr.fileParser.appSegments, ...exifr.fileParser.unknownSegments]
		for (let segment of segments) {
			//console.log(segment)
			console.log(
				getSegName(segment, fileBuffer).padEnd(14, ' '),
				'|',
				'offset', segment.offset.toString().padStart(8, ' '),
				'|',
				'length', segment.length.toString().padStart(8, ' '),
				'|',
				'end', segment.end.toString().padStart(8, ' '),
				'|',
				fileBuffer.slice(segment.offset, segment.offset + 14)
			)
		}
	}
})()

function kb(bytes) {
	return Math.round(bytes / 1024) + 'kb'
}

function getSegName(segment, fileBuffer) {
	return segment.type
		? '√ ' + segment.type
		: '? ' + fileBuffer.slice(segment.offset, segment.offset + 14).toString().replace(/[^\w\s]|\n/g, '').trim()
}