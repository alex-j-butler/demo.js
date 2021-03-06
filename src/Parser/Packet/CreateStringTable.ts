import {BitStream} from 'bit-buffer';
import {CreateStringTablePacket} from '../../Data/Packet';
import {logBase2} from '../../Math';
import {readVarInt, writeVarInt} from '../readBitVar';

import {compress, uncompress} from 'snappyjs';
import {StringTable} from '../../Data/StringTable';
import {encodeStringTableEntries, guessStringTableEntryLength, parseStringTableEntries} from '../StringTableParser';

export function ParseCreateStringTable(stream: BitStream): CreateStringTablePacket { // 12: createStringTable
	const tableName = stream.readASCIIString();
	const maxEntries = stream.readUint16();
	const encodeBits = logBase2(maxEntries);
	const entityCount = stream.readBits(encodeBits + 1);

	const bitCount = readVarInt(stream);

	let userDataSize = 0;
	let userDataSizeBits = 0;

	// userdata fixed size
	if (stream.readBoolean()) {
		userDataSize = stream.readBits(12);
		userDataSizeBits = stream.readBits(4);
	}

	const isCompressed = stream.readBoolean();

	let data = stream.readBitStream(bitCount);

	if (isCompressed) {
		const decompressedByteSize = data.readUint32();
		const compressedByteSize = data.readUint32();

		const magic = data.readASCIIString(4);

		const compressedData = data.readArrayBuffer(compressedByteSize - 4); // 4 magic bytes

		if (magic !== 'SNAP') {
			throw new Error('Unknown compressed stringtable format');
		}

		const decompressedData = uncompress(compressedData);
		if (decompressedData.byteLength !== decompressedByteSize) {
			throw new Error('Incorrect length of decompressed stringtable');
		}

		data = new BitStream(decompressedData.buffer as ArrayBuffer);
	}

	const table: StringTable = {
		name: tableName,
		entries: [],
		maxEntries,
		fixedUserDataSize: userDataSize,
		fixedUserDataSizeBits: userDataSizeBits,
		compressed: isCompressed
	};

	// console.log(`${tableName} ${entityCount} ${bitCount}`);
	table.entries = parseStringTableEntries(data, table, entityCount);

	return {
		packetType: 'createStringTable',
		table
	};
}

export function EncodeCreateStringTable(packet: CreateStringTablePacket, stream: BitStream) {
	stream.writeASCIIString(packet.table.name);
	stream.writeUint16(packet.table.maxEntries);
	const encodeBits = logBase2(packet.table.maxEntries);
	const numEntries = packet.table.entries.filter((entry) => entry).length;
	stream.writeBits(numEntries, encodeBits + 1);

	let entryData = new BitStream(new ArrayBuffer(guessStringTableEntryLength(packet.table, packet.table.entries)));
	encodeStringTableEntries(entryData, packet.table, packet.table.entries);

	if (packet.table.compressed) {
		const decompressedByteLength = Math.ceil(entryData.length / 8);
		entryData.index = 0;
		const compressedData = compress(entryData.readArrayBuffer(decompressedByteLength));
		entryData = new BitStream(new ArrayBuffer(decompressedByteLength));
		entryData.writeUint32(decompressedByteLength);
		entryData.writeUint32(compressedData.byteLength + 4); // 4 magic bytes
		entryData.writeASCIIString('SNAP', 4);
		const typeForce: any = compressedData.buffer;
		entryData.writeArrayBuffer(typeForce as BitStream);
	}
	const entryLength = entryData.index;
	entryData.index = 0;

	writeVarInt(entryLength, stream);

	if (packet.table.fixedUserDataSize || packet.table.fixedUserDataSizeBits) {
		stream.writeBoolean(true);
		stream.writeBits(packet.table.fixedUserDataSize || 0, 12);
		stream.writeBits(packet.table.fixedUserDataSizeBits || 0, 4);
	} else {
		stream.writeBoolean(false);
	}

	stream.writeBoolean(packet.table.compressed);

	if (entryLength) {
		stream.writeBitStream(entryData, entryLength);
	}
}
