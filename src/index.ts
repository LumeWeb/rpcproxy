import {POCKET_ACCOUNT_PRIVATE_KEY, POCKET_ACCOUNT_PUBLIC_KEY, proxyPort, usePocketGateway} from "./env.js";
import {unlockAccount, updateAat, webServer} from "./server.js";

const enableDestroy = require("server-destroy");

(async function () {
    if (!usePocketGateway()) {
        updateAat(
            await unlockAccount(<string>POCKET_ACCOUNT_PRIVATE_KEY,
                <string>POCKET_ACCOUNT_PUBLIC_KEY, '0'));
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
