import { toNano, Address, Dictionary } from '@ton/core';
import { EscrowSM, EscrowSMData } from '../wrappers/EscrowSM';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    // IMPORTANT: Replace this with your actual Ziver Treasury Address
    const ziverTreasuryAddress = Address.parse('UQDl_5CtQqwxSKk9EoUbgKV6XsSDQqqkYYeZ0UFduTZuCtlP');

    // Initial data for the contract, matching the EscrowSMData type
    const initialData: EscrowSMData = {
        ziverTreasuryAddress: ziverTreasuryAddress,
        tasks: Dictionary.empty(),
        accumulatedFees: 0n, // FIX: Added missing 'accumulatedFees' field
    };

    // Create a new instance of the contract
    const escrowSM = provider.open(await EscrowSM.createFromConfig(initialData));

    // Send the deploy transaction using the method from our wrapper
    await escrowSM.sendDeploy(provider.sender(), toNano('0.1'));

    // Wait for the contract to be deployed
    await provider.waitForDeploy(escrowSM.address);

    console.log('EscrowSM contract deployed successfully!');
    console.log(`Contract Address: ${escrowSM.address.toString()}`);
}
