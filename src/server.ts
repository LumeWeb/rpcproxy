import {Configuration, HttpRpcProvider, Pocket, PocketAAT} from "@pokt-network/pocket-js";
import {pockerPort, POCKET_APP_ID, POCKET_APP_KEY, pocketHost, updateUsePocketGateway} from "./env.js";
import express, {Express} from "express";
import {Server as JSONServer} from "jayson/promise";
import {rpcMethods} from "./rpc/index.js";

export let pocketServer: Pocket;
let _aat: PocketAAT;

if (!POCKET_APP_ID || !POCKET_APP_KEY) {
    const dispatchURL = new URL(`http://${pocketHost}:${pockerPort}`)
    const rpcProvider = new HttpRpcProvider(dispatchURL)
    const configuration = new Configuration()
    pocketServer = new Pocket([dispatchURL], rpcProvider, configuration)
    updateUsePocketGateway(false);
}

let jsonServer = new JSONServer(
    rpcMethods,
    {
        useContext: true
    }
);

export const webServer: Express = express();
webServer.use(function (req, res, next) {
    if (!req.headers['content-type']) {
        req.headers['content-type'] = 'application/json';
    }
    next()
});
webServer.use(express.json())
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

export function updateAat(aat: PocketAAT): void {
    _aat = aat;
}

export function getAat(): PocketAAT {
    return _aat;
}

// This is only called once to setup the Pocket Instance and AAT
export async function unlockAccount(accountPrivateKey: string, accountPublicKey: string,
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
