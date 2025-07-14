import { Address, toNano, Dictionary } from '@ton/core'; // FIX: Added Address and Dictionary imports
import { EscrowSM } from '../wrappers/EscrowSM';
import { compile, NetworkProvider } from '@ton/blueprint';
import { EscrowSMData } from '../EscrowSM.types';

export async function run(provider: NetworkProvider) {
    // The treasury address to be stored in the contract.
    // For this test, we can use your own wallet address which is deploying the contract.
    const ziverTreasuryAddress = provider.sender().address;
    if (!ziverTreasuryAddress) {
        throw new Error("Sender address is not defined in the provider!");
    }

    const initialConfig: EscrowSMData = {
        ziverTreasuryAddress: ziverTreasuryAddress,
        tasks: Dictionary.empty(), // FIX: Use Dictionary.empty() instead of new Map()
        accumulatedFees: 0n
    };

    const escrowSM = provider.open(EscrowSM.createFromConfig(initialConfig));

    await escrowSM.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(escrowSM.address);

    console.log('✅ EscrowSM Deployed Successfully!');
    console.log('Contract Address:', escrowSM.address.toString());
    console.log('Treasury Address Set To:', ziverTreasuryAddress.toString());
}
