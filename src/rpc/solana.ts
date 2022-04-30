import {chainNetworks, proxyRpcMethod} from "./common.js";
import {RpcMethodList} from "../types.js";

export default {
    getAccountInfo: proxyRpcMethod('getAccountInfo', [chainNetworks["sol-mainnet"]])
} as RpcMethodList;
