import { toNano } from '@ton/core';
import { EscrowSM } from '../wrappers/EscrowSM';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const escrowSM = provider.open(
        EscrowSM.createFromConfig(
            {
                id: Math.floor(Math.random() * 10000),
                counter: 0,
            },
            await compile('EscrowSM')
        )
    );

    await escrowSM.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(escrowSM.address);

    console.log('ID', await escrowSM.getID());
}
