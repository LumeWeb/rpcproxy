import {Configuration, HttpRpcProvider, Pocket, PocketAAT} from "@pokt-network/pocket-js";
import {ethers} from "ethers";
import {Server as JSONServer} from 'jayson/promise'
import {Express} from "express";
// @ts-ignore
import bodyParserErrorHandler from "express-body-parser-error-handler";

const {NodeClient} = require("hs-client");
const bns = require('bns');
const {StubResolver, RecursiveResolver, dns} = bns;
const {CNAMERecord, ARecord, AAAARecord} = require('bns/lib/wire.js');
const express = require("express");

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

let jsonServer: JSONServer;
let aat: PocketAAT;
let pocketServer: Pocket;
let usePocketGateway = true;
let gatewayProviders: { [name: string]: ethers.providers.JsonRpcProvider } = {};
let rpcMethods: { [name: string]: Function } = {};

if (!POCKET_APP_ID || !POCKET_APP_KEY) {
    const dispatchURL = new URL("http://rpcproxy:8081")
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

    var num = parseInt(chain, 16);
    if (num.toString(16) === chain.toLowerCase()) {
        return chain;
    }

    return false;
}

function isDomain(domain: string) {
    return /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/.test(
        domain
    );
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
        if (usePocketGateway) {
            let provider = gatewayProviders[chain] || false;
            if (!provider) {
                provider =
                    new ethers.providers.JsonRpcProvider({
                                                             url: `https://${chain}.gateway.pokt.network/v1/lb/${POCKET_APP_ID}`,
                                                             password: <string>POCKET_APP_KEY
                                                         })
            }
            gatewayProviders[chain] = provider;
            return await provider.send(method, args);
        } else {
            let chainId = maybeMapChainId(chain);
            if (!chainId) {
                throw  new Error('Invalid Chain');
            }
            return await sendRelay(JSON.stringify(args), <string>chainId, aat);
        }
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
    // @ts-ignore
    if ('icann' !== context.req.query.chain) {
        throw  new Error('Invalid Chain');
    }

    let dnsResult;
    let domain = args.domain;
    let ns = args.nameserver;
    let error;
    const resolverOpt = {
        tcp: true,
        inet6: false,
        edns: true,
        dnssec: true
    };
    let dnsResolver = ns ? new StubResolver(resolverOpt) : new RecursiveResolver(resolverOpt);
    if (ns) {
        let nsIp;
        if (isDomain(ns)) {
            try {
                nsIp = await dns.resolve4(ns);
            } catch (e) {
                return false;
            }
            if (!nsIp || !nsIp.length) {
                return false;
            }
            ns = nsIp.pop();
        }
        dnsResolver.setServers([ns]);
    } else {
        dnsResolver.hints.setDefault();
    }

    await dnsResolver.open();

    try {
        dnsResult = await dnsResolver.lookup(domain);
    } catch (e) {
        error = e;
    }

    await dnsResolver.close();

    if (dnsResult) {
        let records = dnsResult.answer.filter(function (item: object) {
            // @ts-ignore
            return item.data instanceof CNAMERecord || item.data instanceof ARecord || item.data
                   instanceof AAAARecord;
        });
        if (!records.length) {
            return false;
        }
        let record = records.pop().data;

        dnsResult = record.target ?? record.address ?? false;

        return dnsResult;
    }

    throw error;
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

    webServer.listen(proxyPort, () => {
        console.log(`Pocket DNS Proxy listening on port ${proxyPort}`)
    });
})();
