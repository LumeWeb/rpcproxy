import {RpcMethodList} from "../types.js";
import {hsdApiKey, hsdHost, hsdNetworkType, hsdPort} from "../env.js";

const {NodeClient} = require("hs-client");

const hnsClient = new NodeClient(
    {
        network: hsdNetworkType,
        host: hsdHost,
        port: hsdPort,
        apiKey: hsdApiKey,
    });


export default {
    getnameresource: async function (args: any, context: object) {

    // @ts-ignore
    if ('hns' !== context.req.query.chain) {
        throw  new Error('Invalid Chain');
    }

    return await hnsClient.execute('getnameresource', args);
}} as RpcMethodList;
