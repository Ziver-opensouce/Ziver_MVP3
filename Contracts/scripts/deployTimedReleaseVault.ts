import { toNano } from '@ton/core';
import { TimedReleaseVault } from '../wrappers/TimedReleaseVault';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const timedReleaseVault = provider.open(TimedReleaseVault.createFromConfig({}, await compile('TimedReleaseVault')));

    await timedReleaseVault.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(timedReleaseVault.address);

    // run methods on `timedReleaseVault`
}
