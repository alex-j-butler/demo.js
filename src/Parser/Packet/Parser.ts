import {Packet} from "../../Data/Packet";
import {BitStream} from 'bit-buffer';
import {Match} from "../../Data/Match";

export type Parser = (stream: BitStream, match?: Match, skip: boolean = false) => Packet;
export type PacketParserMap = {[id: number]: Parser};
