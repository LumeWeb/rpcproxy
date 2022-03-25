const bns = require('bns');
const {StubResolver,RecursiveResolver} = bns;
let dns = new StubResolver({
                                    tcp: true,
                                    inet6: false,
                                    edns: true,
                                    dnssec: false
                                });
(async function () {
    await dns.open();
   // dns.hints.setDefault();
    dns.setServers(['45.79.214.114']);
  //  dns.on('log', (...args) => console.log(...args));
    let res = await dns.lookup('hcdn','A');
    console.log( res.answer.pop().data.address);
})();
