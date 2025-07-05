import { toNano } from '@ton/core';
import { TimedReeaseVault } from '../wrappers/TimedReeaseVault';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const timedReeaseVault = provider.open(TimedReeaseVault.createFromConfig({}, await compile('TimedReeaseVault')));

    await timedReeaseVault.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(timedReeaseVault.address);

    // run methods on `timedReeaseVault`
}
