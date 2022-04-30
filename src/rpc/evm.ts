import {RpcMethodList} from "../types.js";
import {proxyRpcMethod} from "./common.js";

const rpcMethods: RpcMethodList = {};

function proxyEvmRpcMethod(method: string): Function {
    return proxyRpcMethod(method);
}

['eth_call', 'eth_chainId', 'net_version'].forEach((method) => {
    rpcMethods[method] = proxyEvmRpcMethod(method);
})

export default rpcMethods;
