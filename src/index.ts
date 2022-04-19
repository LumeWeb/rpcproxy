import {Configuration, HttpRpcProvider, Pocket, PocketAAT} from "@pokt-network/pocket-js";
import {ethers} from "ethers";
import {Server as JSONServer} from 'jayson/promise'
import {Express} from "express";
// @ts-ignore
import bodyParserErrorHandler from "express-body-parser-error-handler";
import dotenv from "dotenv";
import fs from "fs";

const {NodeClient} = require("hs-client");
const bns = require('bns');
const {StubResolver, RecursiveResolver} = bns;
const express = require("express");
const enableDestroy = require("server-destroy");

if (fs.existsSync('/data/.env')) {
    dotenv.config({path: '/data/.env'});
}

const POCKET_APP_ID = process.env.POCKET_APP_ID || false;
const POCKET_APP_KEY = process.env.POCKET_APP_KEY || false;
const POCKET_ACCOUNT_PUBLIC_KEY = process.env.POCKET_ACCOUNT_PUBLIC_KEY || false;
const POCKET_ACCOUNT_PRIVATE_KEY = process.env.POCKET_ACCOUNT_PRIVATE_KEY || false;
const chainNetworks = require('../networks.json');
const webServer: Express = express();

const hsdNetworkType = process.env.HSD_NETWORK || "main";
const hsdHost = process.env.HSD_HOST || "handshake";
const hsdPort = Number(process.env.HSD_PORT) || 12037;
const hsdApiKey = process.env.HSD_API_KEY || "foo";
const proxyPort: Number = 80;

const pocketHost = process.env.POCKET_HOST || "pocket";
const pockerPort = process.env.POCKET_PORT || 8081;

let jsonServer: JSONServer;
let aat: PocketAAT;
let pocketServer: Pocket;
let usePocketGateway = true;
let gatewayProviders: { [name: string]: ethers.providers.JsonRpcProvider } = {};
let rpcMethods: { [name: string]: Function } = {};
const resolverOpt = {
    tcp: true,
    inet6: false,
    edns: true,
    dnssec: true
};

const globalResolver = new RecursiveResolver(resolverOpt);
globalResolver.hints.setDefault();
globalResolver.open();

if (!POCKET_APP_ID || !POCKET_APP_KEY) {
    const dispatchURL = new URL(`http://${pocketHost}:${pockerPort}`)
    const rpcProvider = new HttpRpcProvider(dispatchURL)
    const configuration = new Configuration()
    pocketServer = new Pocket([dispatchURL], rpcProvider, configuration)
    usePocketGateway = false;
}
webServer.use(function (req, res, next) {
    if (!req.headers['content-type']) {
        req.headers['content-type'] = 'application/json';
    }
    next()
});
webServer.use(express.json())
//webServer.use(bodyParserErrorHandler())
webServer.use(function (req, res, next) {
    // prepare a context object passed into the JSON-RPC method
    const context = {req};
    if (req.body && !req.body.jsonrpc) {
        req.body.jsonrpc = '2.0';
    }
    if (req.headers['x-chain']) {
        req.query.chain = req.headers['x-chain'];
    }

    jsonServer.call(req.body, context, function (err, result) {
        if (err) {
            return res.send(err);
        }
        res.send(result || {});
    });
});

const hnsClient = new NodeClient(
    {
        network: hsdNetworkType,
        host: hsdHost,
        port: hsdPort,
        apiKey: hsdApiKey,
    });

function maybeMapChainId(chain: string): string | boolean {
    if (chain in chainNetworks) {
        return chainNetworks[chain];
    }

    if ([parseInt(chain, 16).toString(), parseInt(chain, 10).toString()].includes(chain.toLowerCase())) {
        return chain;
    }

    return false;
}

function reverseMapChainId(chainId: string): string | boolean {

    let vals = Object.values(chainNetworks);
    if (!vals.includes(chainId)) {
        return false;
    }

    return Object.keys(chainNetworks)[vals.indexOf(chainId)];
}

function isIp(ip: string) {
    return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
        ip
    );
}

async function resolveNameServer(ns: string): Promise<string | boolean> {
    if (isIp(ns)) {
        return ns;
    }
    let result = await getDnsRecords(ns, 'A');

    if (result.length) {
        return result[0];
    }

    return false;
}

async function getDnsRecords(domain: string, type: string, authority: boolean = false,
                             resolver = globalResolver): Promise<string[]> {
    let result;

    try {
        result = await resolver.lookup(domain, type);
    } catch (e) {
        return [];
    }

    let prop = authority ? 'authority' : 'answer';

    if (!result || !result[prop].length) {
        return [];
    }

    return result[prop].map(
        // @ts-ignore
        (item: object) => item.data.address ?? item.data.target ?? item.data.ns ?? null);
}

// This is only called once to setup the Pocket Instance and AAT
async function unlockAccount(accountPrivateKey: string, accountPublicKey: string,
                             accountPassphrase: string): Promise<PocketAAT> {

    try {
        const account = await pocketServer.keybase.importAccount(
            Buffer.from(accountPrivateKey, 'hex'),
            accountPassphrase
        )

        if (account instanceof Error) {
            // noinspection ExceptionCaughtLocallyJS
            throw account;
        }

        await pocketServer.keybase.unlockAccount(account.addressHex, accountPassphrase, 0)

        return await PocketAAT.from(
            "0.0.1",
            accountPublicKey,
            accountPublicKey,
            accountPrivateKey
        )
    } catch (e) {
        console.error(e)
        process.exit(1);
    }
}

// Call this every time you want to fetch RPC data
async function sendRelay(rpcQuery: string, blockchain: string, pocketAAT: PocketAAT) {
    try {
        return await pocketServer.sendRelay(rpcQuery, blockchain, pocketAAT)
    } catch (e) {
        console.log(e)
        throw e;
    }
}

function proxyEvmRpcMethod(method: string): Function {
    return async function (args: any, context: object) {
        // @ts-ignore
        let chain = context.req.query.chain;
        let chainId = maybeMapChainId(chain);

        if (!chainId) {
            throw new Error('Invalid Chain');
        }

        if (usePocketGateway) {
            chainId = reverseMapChainId(chainId as string);
            if (!chainId) {
                throw new Error('Invalid Chain');
            }

            let provider = gatewayProviders[chainId as string] || false;
            if (!provider) {
                provider =
                    new ethers.providers.JsonRpcProvider({
                        url: `https://${chainId}.gateway.pokt.network/v1/lb/${POCKET_APP_ID}`,
                        password: <string>POCKET_APP_KEY
                    })
            }
            gatewayProviders[chainId as string] = provider;
            return await provider.send(method, args);
        }

        return await sendRelay(JSON.stringify(args), <string>chainId, aat);
    }
}

rpcMethods['getnameresource'] = async function (args: any, context: object) {
    // @ts-ignore
    if ('hns' !== context.req.query.chain) {
        throw  new Error('Invalid Chain');
    }

    return await hnsClient.execute('getnameresource', args);
};
rpcMethods['dnslookup'] = async function (args: any, context: object) {
    let dnsResults: string[] = [];
    let domain = args.domain;
    let ns = args.nameserver;
    let dnsResolver = ns ? new StubResolver(resolverOpt) : globalResolver;
    await dnsResolver.open();

    if (ns) {
        let nextNs = ns;
        let prevNs = null;

        while (nextNs) {
            nextNs = await resolveNameServer(nextNs);
            if (!nextNs) {
                nextNs = prevNs;
            }

            dnsResolver.setServers([nextNs]);

            if (nextNs === prevNs) {
                break;
            }
            let result = await getDnsRecords(domain, 'NS', true, dnsResolver);
            prevNs = nextNs;
            nextNs = result.length ? result[0] : false;
        }
    }

    for (const queryType of ['CNAME', 'A']) {
        let result = await getDnsRecords(domain, queryType, false, dnsResolver);

        if (result) {
            dnsResults = dnsResults.concat(result);
        }
    }

    await dnsResolver.close();

    dnsResults = dnsResults.filter(Boolean);

    if (dnsResults.length) {
        return dnsResults[0];
    }

    return false;
};

['eth_call', 'eth_chainId', 'net_version'].forEach((method) => {
    rpcMethods[method] = proxyEvmRpcMethod(method);
})

jsonServer = new JSONServer(
    rpcMethods,
    {
        useContext: true
    }
);

(async function () {
    if (!usePocketGateway) {
        aat =
            await unlockAccount(<string>POCKET_ACCOUNT_PRIVATE_KEY,
                <string>POCKET_ACCOUNT_PUBLIC_KEY, '0');
    }
    enableDestroy(webServer);
    webServer.listen(proxyPort, () => {
        console.log(`RPC Proxy listening on port ${proxyPort}`)
    });
})();

process.on('SIGTERM', function () {
    // @ts-ignore
    webServer.destroy();
    process.exit(0);
});
