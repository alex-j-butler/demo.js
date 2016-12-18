import {Packet} from "../../Data/Packet";
import {BitStream} from 'bit-buffer';
import {GameEventEntry, GameEventDefinitionMap} from "../../Data/GameEvent";

export function GameEventList(stream: BitStream, events: GameEventDefinitionMap): Packet { // 30: gameEventList
	// list of game events and parameters
	const numEvents = stream.readBits(9);
	const length = stream.readBits(20);
	for (let i = 0; i < numEvents; i++) {
		const id = stream.readBits(9);
		const name = stream.readASCIIString();
		let type = stream.readBits(3);
		const entries: GameEventEntry[] = [];
		while (type !== 0) {
			entries.push({
				type: type,
				name: stream.readASCIIString()
			});
			type = stream.readBits(3);
		}
		events[id] = {
			id: id,
			name: name,
			entries: entries
		};
	}
	return {
		packetType: 'gameEventList',
		events: events
	}
}