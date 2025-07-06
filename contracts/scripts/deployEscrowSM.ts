import { toNano } from '@ton/core';
import { EscrowSM } from '../wrappers/EscrowSM';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const escrowSM = provider.open(EscrowSM.createFromConfig({}, await compile('EscrowSM')));

    await escrowSM.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(escrowSM.address);

    // run methods on `escrowSM`
}
