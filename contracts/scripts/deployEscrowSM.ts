import { toNano } from '@ton/core';
import { EscrowSM } from '../wrappers/EscrowSM';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Opcodes } from '../EscrowSM.types'; // Make sure opcodes are imported if needed for config

export async function run(provider: NetworkProvider) {
    // IMPORTANT: Replace this with your actual Ziver Treasury Address
    const ziverTreasuryAddress = Address.parse('UQDl_5CtQqwxSKk9EoUbgKV6XsSDQqqkYYeZ0UFduTZuCtlP');

    const escrowSM = provider.open(EscrowSM.createFromConfig({
        ziverTreasuryAddress: ziverTreasuryAddress,
        tasks: new Map(), // Use Map for initial config
        accumulatedFees: 0n
    }));

    await escrowSM.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(escrowSM.address);

    console.log('EscrowSM deployed at address:', escrowSM.address);
    console.log('Ziver Treasury set to:', ziverTreasuryAddress);
}
