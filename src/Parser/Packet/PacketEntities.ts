import {PacketEntity, PVS} from '../../Data/PacketEntity';
import {SendProp} from '../../Data/SendProp';
import {PacketEntitiesPacket} from "../../Data/Packet";
import {BitStream} from 'bit-buffer';
import {Match} from "../../Data/Match";
import {readUBitVar} from "../readBitVar";
import {applyEntityUpdate} from "../EntityDecoder";

function readPVSType(stream: BitStream): PVS {
	// https://github.com/skadistats/smoke/blob/a2954fbe2fa3936d64aee5b5567be294fef228e6/smoke/io/stream/entity.pyx#L24
	let pvs;
	const hi  = stream.readBoolean();
	const low = stream.readBoolean();
	if (low && !hi) {
		pvs = PVS.ENTER;
	} else if (!(hi || low)) {
		pvs = PVS.PRESERVE;
	} else if (hi) {
		pvs = (low) ? (PVS.LEAVE | PVS.DELETE) : PVS.LEAVE;
	} else {
		throw new Error('Invalid pvs');
	}
	return pvs;
}

const baseLineCache: {[serverClass: string]: PacketEntity} = {};

function readEnterPVS(stream: BitStream, entityId: number, match: Match): PacketEntity {
	// https://github.com/PazerOP/DemoLib/blob/5f9467650f942a4a70f9ec689eadcd3e0a051956/TF2Net/NetMessages/NetPacketEntitiesMessage.cs#L198
	const serverClass = match.serverClasses[stream.readBits(match.classBits)];
	stream.readBits(10); // unused serial number

	if (baseLineCache[serverClass.id]) {
		const result       = baseLineCache[serverClass.id].clone();
		result.entityIndex = entityId;
		return result;
	} else {
		const entity    = new PacketEntity(serverClass, entityId, PVS.ENTER);
		const sendTable = match.getSendTable(serverClass.dataTable);
		if (!sendTable) {
			throw new Error('Unknown SendTable for serverclass');
		}
		const staticBaseLine = match.staticBaseLines[serverClass.id];
		if (staticBaseLine) {
			staticBaseLine.index = 0;
			applyEntityUpdate(entity, sendTable, staticBaseLine);
			baseLineCache[serverClass.id] = entity.clone();
			if (staticBaseLine.bitsLeft > 7) {
				// console.log(staticBaseLine.length, staticBaseLine.index);
				// throw new Error('Unexpected data left at the end of staticBaseline, ' + staticBaseLine.bitsLeft + ' bits left');
			}
		}
		return entity;
	}
}

function getPacketEntityForExisting(entityId: number, match: Match, pvs: PVS) {
	if (!match.entityClasses[entityId]) {
		throw new Error("unknown entity");
	}
	const serverClass = match.entityClasses[entityId];
	return new PacketEntity(serverClass, entityId, pvs);
}

export function PacketEntities(stream: BitStream, match: Match): PacketEntitiesPacket { //26: packetEntities
	// https://github.com/skadistats/smoke/blob/master/smoke/replay/handler/svc_packetentities.pyx
	// https://github.com/StatsHelix/demoinfo/blob/3d28ea917c3d44d987b98bb8f976f1a3fcc19821/DemoInfo/DP/Handler/PacketEntitesHandler.cs
	// https://github.com/StatsHelix/demoinfo/blob/3d28ea917c3d44d987b98bb8f976f1a3fcc19821/DemoInfo/DP/Entity.cs
	// https://github.com/PazerOP/DemoLib/blob/5f9467650f942a4a70f9ec689eadcd3e0a051956/TF2Net/NetMessages/NetPacketEntitiesMessage.cs
	const maxEntries      = stream.readBits(11);
	const isDelta         = !!stream.readBits(1);
	const delta           = (isDelta) ? stream.readInt32() : null;
	const baseLine        = stream.readBits(1);
	const updatedEntries  = stream.readBits(11);
	const length          = stream.readBits(20);
	const updatedBaseLine = stream.readBoolean();
	const end             = stream.index + length;
	let entityId          = -1;

	const receivedEntities: PacketEntity[] = [];
	for (let i = 0; i < updatedEntries; i++) {
		const diff = readUBitVar(stream);
		entityId += 1 + diff;
		const pvs  = readPVSType(stream);
		if (pvs === PVS.ENTER) {
			const packetEntity = readEnterPVS(stream, entityId, match);
			applyEntityUpdate(packetEntity, match.getSendTable(packetEntity.serverClass.dataTable), stream);

			if (updatedBaseLine) {
				const newBaseLine: SendProp[] = [];
				newBaseLine.concat(packetEntity.props);
				baseLineCache[packetEntity.serverClass.id] = packetEntity.clone();
			}
			packetEntity.inPVS = true;
			receivedEntities.push(packetEntity);
		} else if (pvs === PVS.PRESERVE) {
			const packetEntity = getPacketEntityForExisting(entityId, match, pvs);
			applyEntityUpdate(packetEntity, match.getSendTable(packetEntity.serverClass.dataTable), stream);
			receivedEntities.push(packetEntity);
		} else {
			const packetEntity = getPacketEntityForExisting(entityId, match, pvs);
			receivedEntities.push(packetEntity);
		}
	}

	const removedEntityIds: number[] = [];
	if (isDelta) {
		while (stream.readBoolean()) {
			const entityId = stream.readBits(11);
			removedEntityIds.push(entityId);
		}
	}

	stream.index = end;
	return {
		packetType:      'packetEntities',
		entities:        receivedEntities,
		removedEntities: removedEntityIds
	};
}
