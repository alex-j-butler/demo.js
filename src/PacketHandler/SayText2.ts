import {Match} from '../Data/Match';
import {SayText2Packet} from '../Data/UserMessage';

export function handleSayText2(packet: SayText2Packet, match: Match) {
	match.chat.push({
		kind: packet.kind,
		from: packet.from,
		text: packet.text,
		tick: match.tick
	});
}
