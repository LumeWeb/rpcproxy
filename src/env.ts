import fs from "fs";
import dotenv from "dotenv";
import express, {Express} from "express";

if (fs.existsSync('/data/.env')) {
    dotenv.config({path: '/data/.env'});
}

export const POCKET_APP_ID = process.env.POCKET_APP_ID || false;
export const POCKET_APP_KEY = process.env.POCKET_APP_KEY || false;
export const POCKET_ACCOUNT_PUBLIC_KEY = process.env.POCKET_ACCOUNT_PUBLIC_KEY || false;
export const POCKET_ACCOUNT_PRIVATE_KEY = process.env.POCKET_ACCOUNT_PRIVATE_KEY || false;

export const hsdNetworkType = process.env.HSD_NETWORK || "main";
export const hsdHost = process.env.HSD_HOST || "handshake";
export const hsdPort = Number(process.env.HSD_PORT) || 12037;
export const hsdApiKey = process.env.HSD_API_KEY || "foo";
export const proxyPort: Number = 80;

export const pocketHost = process.env.POCKET_HOST || "pocket";
export const pockerPort = process.env.POCKET_PORT || 8081;

let usingPocketGateway = true;

export function usePocketGateway() {
    return usingPocketGateway;
}

export function updateUsePocketGateway(state: boolean):void {
    usingPocketGateway = state;
}
