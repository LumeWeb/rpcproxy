import {chainNetworks, proxyRpcMethod} from "./common.js";
import {RpcMethodList} from "../types.js";
import {maybeMapChainId, reverseMapChainId} from "../util.js";
import minimatch from "minimatch";
// @ts-ignore
import HTTPClient from "algosdk/dist/cjs/src/client/client.js";
import {POCKET_APP_ID} from "../env.js";
import {sprintf} from "sprintf-js";

const allowedEndpoints: { [endpoint: string]: ("GET" | "POST")[] } = {
    "/v2/teal/compile": ["POST"],
    "/v2/accounts/*": ["GET"]
};

export function proxyRestMethod(apiServer: string, matchChainId: string): Function {
    return async function (args: any, context: object) {
        // @ts-ignore
        let chain = context.req.query.chain;
        let chainId = maybeMapChainId(chain);

        if (!chainId) {
            throw new Error('Invalid Chain');
        }

        chainId = reverseMapChainId(chainId as string);
        if (!chainId || chainId !== matchChainId) {
            throw new Error('Invalid Chain');
        }

        let method = args.method ?? false;
        let endpoint = args.endpoint ?? false;
        let data = args.data ?? false;
        let query = args.query ?? false;
        let fullHeaders = args.fullHeaders ?? {};

        fullHeaders = {...fullHeaders, "Referer": "lumeweb_dns_relay"};

        if (method) {
            method = method.toUpperCase();
        }

        if (!endpoint) {
            throw new Error('Endpoint Missing');
        }

        let found = false;

        for (const theEndpoint in allowedEndpoints) {
            if (minimatch(endpoint, theEndpoint)) {
                found = true;
                break;
            }
        }

        if (!found) {
            throw new Error('Endpoint Invalid');
        }

        let apiUrl;
        try {
            apiUrl = sprintf(apiServer, chainId, POCKET_APP_ID)
        } catch (e) {
            apiUrl = apiServer;
        }

        const client = new HTTPClient({}, apiUrl)
        let resp;
        switch (method) {
            case "GET":
                resp = await client.get(endpoint, query, fullHeaders);
                break;
            case "POST":
                if (Array.isArray(data?.data)) {
                    data = new Uint8Array(Buffer.from(data.data));
                }

                resp = await client.post(endpoint, data, {...fullHeaders});
                break;
            default:
                throw new Error('Method Invalid');
        }

        const getCircularReplacer = () => {
            const seen = new WeakSet();
            return (key: string, value: any): any => {
                if (typeof value === "object" && value !== null) {
                    if (seen.has(value)) {
                        return;
                    }
                    seen.add(value);
                }
                return value;
            };
        };

        return JSON.parse(JSON.stringify(resp, getCircularReplacer()));
    }
}

export default {
    'algorand_rest_request': proxyRestMethod("http://mainnet-api.algonode.network", "algorand-mainnet"),
    //'algorand_rest_request': proxyRestMethod("https://%s.gateway.pokt.network/v1/lb/%s", "algorand-mainnet"),
    'algorand_rest_indexer_request': proxyRestMethod('http://mainnet-idx.algonode.network', "algorand-mainnet-indexer")
} as RpcMethodList;
