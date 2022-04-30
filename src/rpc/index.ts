import {RpcMethodList} from "../types.js";

export * from "./common.js"

import {default as DnsMethods} from "./dns.js"
import {default as EvmMethods} from "./evm.js"
import {default as HnsMethods} from "./handshake.js"

export const rpcMethods: RpcMethodList = Object.assign({}, DnsMethods, EvmMethods, HnsMethods)
